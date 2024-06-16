import { Scope, setIcon, setTooltip, View } from "obsidian";
import SearchInCanvasPlugin from "./main";
import { SearchPanel } from "./searchPanel";

export const updateView = (plugin: SearchInCanvasPlugin, view: any) => {
	if (view.patched) return;

	patchKeys(plugin, view.scope);
	initScope(plugin, view);
	const button = createSearchButton(view.canvas, plugin);
	plugin.searchButton.push(button);


	view.patched = true;
};
export const initScope = (plugin: SearchInCanvasPlugin, view: View & {
	canvas: any;
	searchPanel: SearchPanel | null;
	searchButton: HTMLElement | null;
}) => {
	view.scope?.register(["Mod"], 'f', () => {
		if (!view.canvas?.searchPanel) {
			if (!view.canvas.searchButton) {
				const button = createSearchButton(view.canvas, plugin);
				plugin.searchButton.push(button);
			}

			view.canvas.searchPanel = createSearchPanel(view.canvas, view.canvas.searchButton);
			view.canvas.searchPanel.load();
			plugin.searchPanel.push(view.canvas.searchPanel);
		}
		view.canvas.searchPanel.isShown() ? view.canvas.searchPanel?.focus() : view.canvas.searchPanel.show();
	});

	view.scope?.register(["Mod"], 'g', () => {
		if (view.canvas.searchPanel && view.canvas.searchPanel.isShown()) {
			view.canvas.searchPanel.next();
		}
	});

	view.scope?.register(["Mod", "Shift"], 'g', () => {
		if (view.canvas.searchPanel && view.canvas.searchPanel.isShown()) {
			view.canvas.searchPanel.previous();
		}
	});

	view.scope?.register([], 'F3', () => {
		if (view.canvas.searchPanel && view.canvas.searchPanel.isShown()) {
			view.canvas.searchPanel.next();
		}
	});

	view.scope?.register(["Shift"], 'F3', () => {
		if (view.canvas.searchPanel && view.canvas.searchPanel.isShown()) {
			view.canvas.searchPanel.previous();
		}
	});
};

export const patchKeys = (plugin: SearchInCanvasPlugin, scope: Scope) => {
	(scope as Scope & {
		keys: any[]
	}).keys.forEach((key: any) => {
		const oldFunc = key.func;
		key.func = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			oldFunc(e);
		};
		key.func._original = oldFunc;
	});

	const uninstaller = () => {
		(scope as Scope & {
			keys: any[]
		}).keys.forEach((key) => {
			key.func = key.func._original || key.func;
		});
	};

	plugin.register(uninstaller);
};

export const createSearchPanel = (canvas: any, targetEl: HTMLElement) => {
	return new SearchPanel(canvas, targetEl);
};

export const createSearchButton = (canvas: any, plugin: SearchInCanvasPlugin) => {
	if (canvas.searchButton) return canvas.searchButton;

	const groupEl = createEl('div', {
		cls: 'canvas-control-group',
	});


	const searchButton = groupEl.createEl('div', {
		cls: 'canvas-control-item',
	});

	setIcon(searchButton, 'search');
	setTooltip(searchButton, 'Search', {
		placement: 'left'
	});

	searchButton.addEventListener('click', () => {
		if (!canvas.searchPanel) {
			canvas.searchPanel = createSearchPanel(canvas, searchButton);
			canvas.searchPanel.load();
			plugin.searchPanel.push(canvas.searchPanel);
		}
		canvas.searchPanel.isShown() ? canvas.searchPanel.hide() : canvas.searchPanel.show();
	});
	canvas.canvasControlsEl.prepend(groupEl);
	canvas.searchButton = searchButton;
	canvas.searchButtonGroup = groupEl;

	return searchButton;
};
