import { Plugin, View, WorkspaceLeaf } from "obsidian";
import { around } from "monkey-around";

import { updateView } from "./searchInit";
import { SearchPanel } from "./searchPanel";

export default class SearchInCanvasPlugin extends Plugin {
	canvas: any;
	searchPanel: SearchPanel[] = [];
	searchButton: HTMLElement[] = [];

	patchAlready: boolean = false;

	async onload() {
		this.patchCanvas();
		this.app.workspace.onLayoutReady(() => {
			const leaves = this.app.workspace.getLeavesOfType('canvas');
			leaves.forEach(leaf => {
				updateView(this, leaf.view);
			});
		});
	}

	onunload() {
		this.searchPanel.forEach(panel => panel.unload());
		this.searchButton.forEach(button => {
			if (button.parentElement) button.parentElement.detach();
		});

		const leaves = this.app.workspace.getLeavesOfType('canvas') as WorkspaceLeaf[];
		leaves.forEach((leaf: WorkspaceLeaf & {
			view: View & {
				canvas: any;
				patched: boolean;
			}
		}) => {
			if ((leaf.view).patched) {
				leaf.view.canvas.searchPanel = null;
				leaf.view.canvas.searchButton = null;
				leaf.view.patched = false;
			}
		});
	}

	patchCanvas() {
		const init = (plugin: SearchInCanvasPlugin) => {
			if (plugin.patchAlready) return true;
			const view = plugin.app.workspace.getLeavesOfType('canvas')[0]?.view;
			if (!view) return false;

			const canvas = (view as View & {
				canvas: any
			}).canvas;

			if (!canvas) return false;

			const uninstaller = around(view.constructor.prototype, {
				onload: (next: any) => {
					return function () {
						next.apply(this);
						updateView(plugin, this);
					};
				},
				onResize: (next: any) => {
					return function (...args: any) {
						next.apply(this, args);
						this.canvas?.searchPanel && this.canvas?.searchPanel?.isShown() && this.canvas?.searchPanel?.updatePosition();
					};
				},
				onunload: (next: any) => {
					return function () {
						next.apply(this);
						if (this.canvas?.searchPanel) {
							this.canvas.searchPanel.unload();
							this.canvas.searchButton?.detach();
							this.canvas.searchButtonGroup?.detach();
							this.canvas.searchPanel = null;
							this.canvas.searchButton = null;
							this.patched = false;
						}
					};
				}
			});

			this.register(uninstaller);
			this.patchAlready = true;
		};

		this.app.workspace.onLayoutReady(() => {
			if (!init(this)) {
				const evt = this.app.workspace.on("layout-change", () => {
					init(this) && this.app.workspace.offref(evt);
				});
				this.registerEvent(evt);
			}
		});

		const initPatch = (plugin: SearchInCanvasPlugin) => {
			const leafUninstaller = around(WorkspaceLeaf.prototype, {
				openFile: (next) => {
					return async function (viewState, eState) {
						const result = await next.apply(this, [viewState, eState]);

						if (plugin.patchAlready) {
							leafUninstaller();
							return;
						}

						if (this.view instanceof View && this.view.canvas && !this.view.canvas.searchPanel) {
							init(plugin);
							updateView(plugin, this.view);
							leafUninstaller();
						}

						return result;
					};
				}
			});

			this.register(leafUninstaller);
		};

		initPatch(this);
	}
}
