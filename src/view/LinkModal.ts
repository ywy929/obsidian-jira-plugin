import { App, Modal, Setting, Notice, requestUrl } from 'obsidian';
import DailyWorkflowPlugin from '../../main';

export class LinkModal extends Modal {
  url = '';
  title = '';
  summary = '';
  private autoFilledTitle = false;

  constructor(app: App, private plugin: DailyWorkflowPlugin, private issueKey: string, private onDone?: () => void) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: `Add link to ${this.issueKey}` });

    let titleInput: HTMLInputElement;
    let statusEl: HTMLElement;

    new Setting(contentEl).setName('URL').setDesc('Title is auto-fetched when you leave this field').addText(t => {
      t.setPlaceholder('https://...').onChange(v => { this.url = v; });
      t.inputEl.addEventListener('blur', () => this.autoFetchTitle(titleInput, statusEl));
    });

    statusEl = contentEl.createDiv({ cls: 'dw-link-status' });

    new Setting(contentEl).setName('Title').addText(t => {
      titleInput = t.inputEl;
      t.setPlaceholder('Auto-filled or override here').onChange(v => { this.title = v; });
    });

    new Setting(contentEl).setName('Summary').addTextArea(t => {
      t.setPlaceholder('Optional longer description').onChange(v => { this.summary = v; });
    });

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setCta().setButtonText('Add').onClick(async () => {
        const url = this.url.trim();
        if (!url) { new Notice('URL required.'); return; }
        if (!/^https?:\/\//i.test(url)) { new Notice('URL must start with http:// or https://'); return; }
        try {
          await this.plugin.jira.addRemoteLink(this.issueKey, url, this.title, this.summary);
          new Notice(`Link added to ${this.issueKey}.`);
          this.close();
          this.onDone?.();
        } catch (e: any) {
          new Notice(`Failed: ${e.message ?? e.kind}`);
        }
      }));
  }

  private async autoFetchTitle(titleInput: HTMLInputElement, statusEl: HTMLElement) {
    const url = this.url.trim();
    if (!/^https?:\/\//i.test(url)) return;
    // only auto-fill if the title field is empty or was previously auto-filled by us
    if (titleInput.value.trim() && !this.autoFilledTitle) return;

    statusEl.setText('Fetching title…');
    try {
      const response = await requestUrl({ url, method: 'GET', throw: false });
      if (response.status < 200 || response.status >= 300) {
        statusEl.setText(`Fetch returned ${response.status}`);
        return;
      }
      const body = response.text ?? '';
      const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
      if (!match) { statusEl.setText('No <title> in response'); return; }
      const extracted = decodeHtmlEntities(match[1].trim().replace(/\s+/g, ' '));
      titleInput.value = extracted;
      this.title = extracted;
      this.autoFilledTitle = true;
      statusEl.setText('');
    } catch (e: any) {
      statusEl.setText(`Fetch failed: ${e?.message ?? 'unknown'}`);
    }
  }

  onClose() { this.contentEl.empty(); }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)));
}
