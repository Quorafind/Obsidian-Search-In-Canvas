import {
	ButtonComponent,
	Component,
	debounce,
	ExtraButtonComponent,
	FuzzyMatch,
	Menu,
	MenuItem,
	Platform,
	prepareFuzzySearch,
	SearchComponent,
	setTooltip
} from "obsidian";
import { computePosition, flip, offset } from "@floating-ui/dom";

const remote = Platform.isDesktop ? require('electron').remote : null;

export class SearchPanel extends Component {
	canvas: any;
	targetEl: HTMLElement;
	floatingElement: HTMLElement | null = null;

	inputContainerEl: HTMLElement | null = null;
	countEl: HTMLElement | null = null;
	infoEl: HTMLElement | null = null;

	searchBar: SearchComponent | null = null;

	private currentIndex = 0;

	highlightedNodes: Map<string, any> = new Map();
	selectedNode: any = null;

	prevBtn: ButtonComponent | null = null;
	nextBtn: ButtonComponent | null = null;
	configBtn: ButtonComponent | null = null;

	searchEdge: boolean = true;
	searchGroup: boolean = true;

	isSelfCalled: boolean = false;

	constructor(canvas: any, targetEl: HTMLElement) {
		super();
		this.canvas = canvas;
		this.targetEl = targetEl;
	}

	debounceSearch = debounce(this.onSearch, 300);

	onload() {
		super.onload();
		// 创建浮动元素
		this.floatingElement = createEl('div', {
			cls: 'canvas-search-panel',
		});
		this.floatingElement.hide();

		const searchBarContainer = this.floatingElement.createEl('div', {
			cls: 'canvas-search-bar-container',
		});
		const matchCountEl = this.floatingElement.createEl('div', {
			cls: 'canvas-search-match-count',
		});


		this.inputContainerEl = searchBarContainer.createEl('div', {
			cls: ['canvas-search-input-container', 'is-empty'],
		});

		this.searchBar = new SearchComponent(this.inputContainerEl);
		this.searchBar.onChange((value) => {
			if (value === "") {
				this.highlightedNodes.forEach((node) => {
					node?.nodeEl?.toggleClass('canvas-search-highlight', false);
					if (this.searchEdge) {
						node.deselect();
						node.blur();
					}
				});
				this.inputContainerEl?.toggleClass('is-empty', true);
				this.highlightedNodes.clear();
				this.countEl?.hide();
				this.canvas.wrapperEl.toggleClass('is-searching', false);
			}

			this.inputContainerEl?.toggleClass('is-empty', value === "");
			this.debounceSearch();
		});
		this.searchBar.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const action = e.ctrlKey ? 'edit' : e.shiftKey ? 'previous' : 'next';

				if (action === 'edit' && this.selectedNode) {
					this[action]();
					return;
				}

				if (this.highlightedNodes.size > 1) {
					this[action]();
					return;
				}

				this.onSearch();
				if (this.highlightedNodes.size === 1) {
					const node = this.highlightedNodes.values().next().value;
					this.selectAndZoom(node);
				}
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.hide();
			}
			// if (e.ctrlKey && e.key === 'f') {
			// 	this.hide();
			// }
		});

		const buttonGroup = searchBarContainer.createEl('div', {
			cls: 'canvas-search-button-group',
		});

		this.prevBtn = new ButtonComponent(buttonGroup.createEl('div', {
			cls: ['canvas-search-prev-btn-container', 'canvas-search-control-item']
		})).setIcon('chevron-left').onClick(() => {
			this.previous();
		});
		this.nextBtn = new ButtonComponent(buttonGroup.createEl('div', {
			cls: ['canvas-search-next-btn-container', 'canvas-search-control-item']
		})).setIcon('chevron-right').onClick(() => {
			this.next();
		});


		this.infoEl = this.floatingElement.createEl('div', {
			cls: 'canvas-search-info-panel',
		});

		[{
			desc: 'Start searching',
			hotkeys: ['Enter', 'Shift+Enter']
		}, {
			desc: 'Select next match',
			hotkeys: [(Platform.isMacOS ? 'Command' : 'Ctrl') + '+G', "F3"]
		}, {
			desc: 'Select previous match',
			hotkeys: [(Platform.isMacOS ? 'Command' : 'Ctrl') + '+Shift+G', 'Shift+F3']
		}, {
			desc: 'Edit selected node',
			hotkeys: [(Platform.isMacOS ? 'Command' : 'Ctrl') + '+Enter']
		}, {
			desc: 'Close search',
			hotkeys: ['Esc']
		}].forEach(({desc, hotkeys}) => this.createInstruction(desc, hotkeys));

		this.infoEl.hide();


		this.countEl = matchCountEl.createEl('span', {
			cls: 'canvas-search-count',
		});
		this.countEl?.hide();

		matchCountEl.createEl('span', {
			cls: 'spacer'
		});

		matchCountEl.createEl('span', {
			cls: 'canvas-search-info',
		}, (el) => {
			this.configBtn = new ButtonComponent(el.createEl('div', {
				cls: ['canvas-search-config-btn-container', 'canvas-search-control-item']
			})).setIcon('settings-2').onClick((evt) => {
				const menu = new Menu();
				menu.addItem((item: MenuItem) => {
					item.setTitle('Group').setChecked(this.searchGroup).onClick(() => {
						this.searchGroup = !this.searchGroup;
						this.onSearch();
					});
				});
				menu.addItem((item: MenuItem) => {
					item.setTitle('Edge').setChecked(this.searchEdge).onClick(() => {
						this.searchEdge = !this.searchEdge;
						this.onSearch();
					});
				});

				menu.showAtMouseEvent(evt);
			});

			new ExtraButtonComponent(el).setIcon('help-circle').onClick(() => {
				if (!this.infoEl) return;
				this.infoEl.isShown() ? this.infoEl.hide() : this.infoEl.show();
			});
		});


		this.canvas.wrapperEl.appendChild(this.floatingElement);
	}

	onunload() {
		super.onunload();
		if (this.floatingElement) {
			this.floatingElement.detach();
		}
	}

	createInstruction(desc: string, hotkeys: string[]) {
		this.infoEl?.createDiv({
				cls: "canvas-instruction"
			}, (n) => {
				n.createDiv({
					cls: "canvas-instruction-label",
					text: desc
				});
				n.createDiv({
						cls: "canvas-instruction-desc"
					}, (e) => {
						for (let n = 0, i = hotkeys; n < i.length; n++) {
							let r = i[n];
							e.createSpan({
								cls: "setting-hotkey",
								text: r
							});
						}
					}
				);
			}
		);
	}

	show() {
		if (this.floatingElement) {
			this.floatingElement.show();
			this.floatingElement.toggleClass('is-shown', true);
			computePosition(this.targetEl, this.floatingElement, {
				placement: 'left-start',
				middleware: [offset(6), flip()],
			}).then(({x, y}) => {
				if (!this.floatingElement) return;
				Object.assign(this.floatingElement.style, {
					left: `${x}px`,
					top: `${y}px`,
				});
			});

			this.focus();

			const captureEvent = (e: MouseEvent) => {
				if (this.isSelfCalled) {
					this.isSelfCalled = false;
					return;
				}

				if ((e.target as HTMLElement).closest('.menu') || (e.target as HTMLElement).closest('.canvas-search-panel') || (e.target as HTMLElement).closest('.canvas-control-item')) return;
				this.hide();

				activeDocument.body.removeEventListener('click', captureEvent, {capture: true});
			};


			// Hide when click outside
			activeDocument.body.addEventListener('click', captureEvent, {capture: true});
		}

	}

	updatePosition() {
		if (this.floatingElement && this.floatingElement.isShown()) {
			computePosition(this.targetEl, this.floatingElement, {
				placement: 'left-start',
				middleware: [offset(6), flip()],
			}).then(({x, y}) => {
				if (!this.floatingElement) return;
				Object.assign(this.floatingElement.style, {
					left: `${x}px`,
					top: `${y}px`,
				});
			});
		}
	}

	hide() {


		if (this.floatingElement) {
			this.searchBar?.clearButtonEl.click();
			this.floatingElement.hide();
			this.floatingElement.toggleClass('is-shown', false);
			this.highlightedNodes.forEach((node) => {
				node?.nodeEl?.toggleClass('canvas-search-highlight', false);
				if (this.searchEdge) {
					node.deselect();
					node.blur();
				}
			});
			this.highlightedNodes.clear();
			this.selectedNode = null;
			this.infoEl && this.infoEl.hide();

			this.canvas.wrapperEl.toggleClass('is-searching', false);
			this.canvas.wrapperEl.focus();
		}
	}

	next() {
		if (this.highlightedNodes.size === 0) this.onSearch();
		if (this.highlightedNodes.size === 0) return;

		const nodes = Array.from(this.highlightedNodes.values());
		if (nodes.length === 1) {
			this.selectAndZoom(nodes[0]);
			return;
		}

		this.currentIndex = (this.currentIndex + 1) % nodes.length;
		this.selectedNode = nodes[this.currentIndex];
		this.selectAndZoom(nodes[this.currentIndex]);
	}

	previous() {
		if (this.highlightedNodes.size === 0) this.onSearch();
		if (this.highlightedNodes.size === 0) return;

		const nodes = Array.from(this.highlightedNodes.values());
		if (nodes.length === 1) {
			this.selectAndZoom(nodes[0]);
			return;
		}

		this.currentIndex = (this.currentIndex - 1 + nodes.length) % nodes.length;
		this.selectedNode = nodes[this.currentIndex];
		this.selectAndZoom(nodes[this.currentIndex]);
	}

	selectAndZoom(node: any) {
		if (this.searchEdge && node.lineGroupEl) {
			this.canvas.selectOnly(node);
			this.canvas.zoomToSelection();

			return;
		}

		this.canvas.selectOnly(node);
		this.canvas.zoomToSelection();
	}

	focus() {
		if (this.searchBar) {
			this.searchBar?.inputEl.focus();
		}
	}

	edit() {
		if (this.selectedNode) {
			const isEdge = this.searchEdge && !!this.selectedNode.lineGroupEl;

			!isEdge ? this.selectedNode.startEditing() : (() => {
				this.selectedNode.labelElement?.focus();
				this.isSelfCalled = true;

				this.selectedNode.labelElement?.wrapperEl.click();
			})();
		}
	}

	isShown() {
		return this.floatingElement?.isShown() ?? false;
	}

	fuzzySearchItemsOptimized(query: string, items: {
		node: any;
		value: string;
	}[]): FuzzyMatch<{
		node: any;
		value: string;
	}>[] {
		const preparedSearch = prepareFuzzySearch(query);

		return items
			.map((item) => {
				const result = preparedSearch(item.value);
				if (result) {
					return {
						item: item,
						match: result,
						score: result.score,
					};
				}
				return null;
			})
			.sort((a, b) => (b?.score || 0) - (a?.score || 0))
			.filter(Boolean).filter((a) => {
				// @ts-ignore
				return a?.score > -5;
			}) as FuzzyMatch<{
			node: any;
			value: string;
		}>[];
	}

	async onSearch() {
		this.currentIndex = 0;
		const value = this.searchBar?.inputEl.value;
		if (!value) return;

		this.canvas.wrapperEl.toggleClass('is-searching', true);

		const searchableNodes: { node: any; value: string }[] = [];

		for (const node of this.canvas.nodes.values()) {
			const nodeProperties = ['text', 'filePath', 'url', this.searchGroup ? 'label' : ''];
			for (const prop of nodeProperties) {
				if (!prop) continue;
				if (node[prop]) {
					let searchValue = node[prop];
					if (prop === 'url' && node.frameEl && Platform.isDesktop) {
						const frameEl = node.frameEl;
						if (!this.canvas.wrapperEl.contains(frameEl)) continue;
						const webContents = remote.webContents.fromId(frameEl.getWebContentsId());

						try {
							const bodyText = await webContents.executeJavaScript(`document.body.innerText;`, true);
							const title = webContents.getTitle();
							searchValue += ` - ${title} - ${bodyText}`;
						} catch (error) {
							console.error("Error fetching web contents: ", error);
						}
					}
					if (node.file && node.child && node.child.data && node.file.extension === 'md') {
						searchValue = node.file.basename + '\n' + node.child.data;
					} else if (node.file && node.file.extension === 'md') {
						const fileContent = await this.canvas.app.vault.cachedRead(node.file);
						searchValue = node.file.basename + '\n' + fileContent;
					}
					searchableNodes.push({node, value: searchValue});
					break;
				}
			}
		}

		if (this.searchEdge) {
			for (const node of this.canvas.edges.values()) {
				const label = node.label;
				if (label) {
					searchableNodes.push({node, value: label});
				}
			}
		}


		const searchResults = this.fuzzySearchItemsOptimized(value, searchableNodes);
		const nodeMap = new Map();

		// Remove existing highlights
		this.highlightedNodes.forEach((node) => {
			node?.nodeEl?.toggleClass('canvas-search-highlight', false);
			if (node.lineGroupEl) {

				node.deselect();
				node.blur();
			}
		});

		// Apply new highlights
		searchResults.forEach(({item}) => {
			const {node} = item;
			if (node.nodeEl) {
				node.nodeEl.toggleClass('canvas-search-highlight', true);
				nodeMap.set(node.id, node);
			} else if (this.searchEdge && node.lineGroupEl) {
				node.select();
				nodeMap.set(node.id, node);
			}
		});

		this.highlightedNodes = nodeMap;
		if (this.countEl) {
			this.countEl?.setText(`${searchResults.length} matches`);
			this.countEl?.show();
			setTooltip(this.countEl, 'Press Enter to select the next match');
		}
	}

}
