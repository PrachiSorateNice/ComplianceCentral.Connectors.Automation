import { Page, expect } from '@playwright/test';
import { attachmentPath } from '../../Utils/LSEG/chatData';
import { LsegCredentials, displayNameFromEmail, lsegConfig } from '../../Utils/LSEG/config';

const DEFAULT_TIMEOUT = 15_000;
const PAGE_LOAD_TIMEOUT = 60_000;

// Selectors ported from the Java LsegMessenger page object.
const SEL = {
  username: "input[placeholder='User ID']",
  password: "input[placeholder='Password']",
  signIn: "//div[text()='Sign In']",
  searchBox: "input[placeholder^='Search for people']",
  messageInput: "[role='textbox'][contenteditable='true']",
  messageRow: '.actionmenu-trigger',
  replyItem: "[data-testid='reply-message-item']",
  fileInput: "input[type='file']",
  attachPlugin: "[data-testid='editor-attachment-plugin']",
  buzzButton: "//div[@tooltip='Send a buzz']",
};

/** Page object for one logged-in LSEG Messenger user (one browser context per user). */
export class LsegMessenger {
  readonly displayName: string;

  constructor(
    readonly page: Page,
    readonly creds: LsegCredentials,
    readonly label: string,
  ) {
    this.displayName = displayNameFromEmail(creds.username);
  }

  async login(): Promise<void> {
    const { page } = this;
    await page.goto(lsegConfig.url, { timeout: PAGE_LOAD_TIMEOUT });

    // Already logged in (shared session)?
    if (await page.locator(SEL.searchBox).isVisible()) return;

    // "Messenger Already Open" duplicate-session dialog.
    const continueBtn = page.getByText('CONTINUE SESSION HERE');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(2000);
      if (await page.locator(SEL.searchBox).isVisible()) return;
    }

    await page.locator(SEL.username).first().fill(this.creds.username, { timeout: PAGE_LOAD_TIMEOUT });
    await page.locator(SEL.password).first().fill(this.creds.password);
    try {
      await page.locator(SEL.signIn).first().click({ timeout: DEFAULT_TIMEOUT });
    } catch {
      await page.locator(SEL.password).first().press('Enter');
    }
    await page.locator(SEL.searchBox).waitFor({ timeout: 180_000 });
  }

  /**
   * Opens an existing conversation by name via the search omnibox (I2I, BLC and MCR rooms pre-exist).
   * For a group pass "First Name, Second Name"; for a 1:1 pass the display name.
   */
  async openChatByName(chatName: string): Promise<void> {
    const { page } = this;
    const members = chatName.split(',');
    const isGroup = members.length > 1;
    const firstMember = members[0].trim();
    const searchKey = isGroup ? `${firstMember}, ${members[1].trim()}` : firstMember;

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    const searchBox = page.locator(SEL.searchBox).first();
    await searchBox.waitFor({ timeout: DEFAULT_TIMEOUT });
    await searchBox.click({ force: true });
    await searchBox.fill('');
    await searchBox.pressSequentially(searchKey, { delay: 80 });
    await page.waitForTimeout(2500); // let the MY NETWORK dropdown populate

    const clickResult = () => page.evaluate(clickSearchResult, { searchKey, isGroup, firstMember });
    const result = await clickResult();
    if (result === null) {
      throw new Error(`No search result matching '${chatName}' in the MY NETWORK dropdown`);
    }

    // Confirm the composer appeared; re-fire the click up to 3 times.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.locator(SEL.messageInput).first().waitFor({ state: 'visible', timeout: 5000 });
        return;
      } catch {
        if (attempt < 3) {
          await clickResult();
          await page.waitForTimeout(1500);
        }
      }
    }
    throw new Error(`Chat '${chatName}' clicked but composer never appeared`);
  }

  /** Opens a 1:1 (I2I) chat with another user: sidebar first, search as fallback. */
  async openI2IChat(target: LsegMessenger): Promise<void> {
    const clicked = await this.page.evaluate(clickSidebarEntry, target.displayName);
    if (clicked) {
      await this.page.locator(SEL.messageInput).first().waitFor({ timeout: DEFAULT_TIMEOUT });
    } else {
      await this.openChatByName(target.displayName);
    }
  }

  /** Types and sends a message in the open conversation (emoji-safe via insertText). */
  async sendMessage(message: string): Promise<void> {
    const { page } = this;
    const input = page.locator(SEL.messageInput).first();
    await input.waitFor({ timeout: DEFAULT_TIMEOUT });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await input.click().catch(() => input.focus());
    await page.keyboard.insertText(message);
    await input.press('Enter');
    await page.waitForTimeout(800);
  }

  /** Sends a Buzz nudge from the active conversation. */
  async sendBuzz(): Promise<void> {
    const buzzButton = this.page.locator(SEL.buzzButton);
    await expect(buzzButton).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await buzzButton.click();
  }

  /** Threaded quote-reply to the message containing `targetSnippet`; falls back to a plain send. */
  async replyToMessage(targetSnippet: string, replyText: string): Promise<void> {
    const { page } = this;
    const row = page.locator(SEL.messageRow).filter({ hasText: targetSnippet }).last();
    await row.waitFor({ timeout: DEFAULT_TIMEOUT });
    await row.scrollIntoViewIfNeeded();
    await row.hover({ force: true });
    await page.waitForTimeout(500);

    try {
      const reply = page.locator(SEL.replyItem).first();
      await reply.waitFor({ timeout: 4000 });
      await reply.click({ force: true });
    } catch {
      await page.evaluate(() => (document.querySelector('[data-testid="reply-message-item"]') as HTMLElement | null)?.click());
    }

    const input = page.locator(SEL.messageInput).first();
    await input.waitFor({ timeout: DEFAULT_TIMEOUT });
    await input.click().catch(() => input.focus());
    await page.keyboard.insertText(replyText);
    await input.press('Enter');
    await page.waitForTimeout(800);
  }

  /** Shares a file from LSEG_ATTACHMENTS_DIR in the open conversation (raise `uploadWaitMs` for large files). */
  async shareAttachment(fileName: string, uploadWaitMs = 2000): Promise<void> {
    const { page } = this;
    const file = attachmentPath(fileName);

    await page.locator(SEL.messageInput).first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);

    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: DEFAULT_TIMEOUT }),
        (async () => {
          const plugin = page.locator(SEL.attachPlugin).first();
          if ((await plugin.count()) > 0) {
            await plugin.click({ timeout: 5000 }).catch(() => plugin.dispatchEvent('click'));
          } else {
            await page.locator(SEL.fileInput).first().dispatchEvent('click');
          }
        })(),
      ]);
      await chooser.setFiles(file);
    } catch {
      await page.locator(SEL.fileInput).first().setInputFiles(file);
    }
    await page.waitForTimeout(uploadWaitMs);

    await page.locator(SEL.messageInput).first().press('Enter');
    await page.waitForTimeout(4000);
  }

  /** Fails unless a message containing `snippet` is visible in chat history. */
  async expectMessageVisible(snippet: string): Promise<void> {
    const text = (snippet.length > 150 ? snippet.slice(0, 150) : snippet).trim();
    if (!text) return;
    const row = this.page.locator(SEL.messageRow).filter({ hasText: text }).last();
    try {
      await expect(row).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    } catch {
      await expect(this.page.getByText(text).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    }
  }
}

/** Browser-side: click the sidebar entry for `targetName` in the left 25% of the viewport. */
function clickSidebarEntry(targetName: string): boolean {
  const boundary = window.innerWidth * 0.25;
  const matches = Array.from(document.querySelectorAll<HTMLElement>('span,div,a,button'))
    .filter((el) => el.offsetParent !== null && (el.innerText || '').trim().includes(targetName))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= boundary;
    })
    .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
  if (!matches.length) return false;
  let el: HTMLElement | null = matches[0];
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    if (style.cursor === 'pointer' || el.getAttribute('role') === 'button' || el.tagName === 'A' || el.tagName === 'BUTTON') {
      el.click();
      return true;
    }
    el = el.parentElement;
  }
  matches[0].click();
  return true;
}

/**
 * Browser-side: find the matching search-dropdown row (exact -> case-insensitive -> starts-with ->
 * shortest-contains) and click it. Returns a description of the match, or null.
 */
function clickSearchResult({ searchKey, isGroup, firstMember }: { searchKey: string; isGroup: boolean; firstMember: string }): string | null {
  const lc = searchKey.toLowerCase();
  const fml = firstMember.toLowerCase();
  const firstLine = (el: HTMLElement) =>
    (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  const allVisible = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((e) => e.offsetParent !== null);
  const clickable = allVisible.filter((e) => window.getComputedStyle(e).cursor === 'pointer');
  const click = (el: HTMLElement, tag: string) => {
    el.click();
    return `${tag}:${firstLine(el)}`;
  };

  if (isGroup) {
    const rows = clickable.filter((e) => firstLine(e).includes(','));
    for (const r of rows) if (firstLine(r) === searchKey) return click(r, 'G-exact');
    for (const r of rows) if (firstLine(r).toLowerCase() === lc) return click(r, 'G-iexact');
    for (const r of rows) if (firstLine(r).toLowerCase().startsWith(fml)) return click(r, 'G-starts');
    let best: HTMLElement | null = null;
    let bestLen = Infinity;
    for (const r of rows) {
      const fl = firstLine(r);
      if (fl.toLowerCase().includes(fml) && fl.length < bestLen) { best = r; bestLen = fl.length; }
    }
    return best ? click(best, 'G-contains') : null;
  }

  for (const e of clickable) if (firstLine(e) === searchKey) return click(e, 'P-exact');
  for (const e of clickable) if (firstLine(e).toLowerCase() === lc) return click(e, 'P-iexact');
  for (const e of allVisible) if (firstLine(e) === searchKey) return click(e, 'A-exact');
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const e of clickable) {
    const f = firstLine(e);
    if (f.toLowerCase().includes(lc) && f.length < bestLen) { best = e; bestLen = f.length; }
  }
  return best ? click(best, 'P-contains') : null;
}
