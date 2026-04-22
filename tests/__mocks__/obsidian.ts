// Jest mock of the Obsidian module surface used in tests.

export const requestUrl = jest.fn();

export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {
  constructor(public containerEl: any) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addTextArea() { return this; }
  addToggle() { return this; }
  addButton() { return this; }
}

export const normalizePath = (p: string) => p.replace(/\\/g, '/');
