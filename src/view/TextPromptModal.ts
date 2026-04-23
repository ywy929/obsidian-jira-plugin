import { App, Modal, Setting } from 'obsidian';

export class TextPromptModal extends Modal {
  value = '';
  constructor(app: App, private prompt: string, private onSubmit: (v: string) => void, private multiline = false) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.prompt });
    new Setting(contentEl)
      .addTextArea(t => {
        t.onChange(v => this.value = v);
        if (!this.multiline) (t as any).inputEl.rows = 1;
      })
      .addButton(b => b.setButtonText('OK').setCta().onClick(() => { this.onSubmit(this.value); this.close(); }));
  }
  onClose() { this.contentEl.empty(); }
}
