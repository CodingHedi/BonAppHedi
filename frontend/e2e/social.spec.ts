import { expect, test } from './fixtures';

const BABKA = '/fr/recettes/babka-au-chocolat';
const SHAKSHUKA = '/fr/recettes/chakchouka';

/**
 * Hosts that would mean a third party learned the visitor's IP.
 *
 * `googleusercontent.com` is here because it is where commenter avatars used to
 * be fetched from, and because this list did not catch it: `google\.com` does not
 * match `lh3.googleusercontent.com`, so the one leak the site actually had went
 * straight past the guard written to prevent exactly it (ADR 7).
 */
const THIRD_PARTY =
  /facebook\.com|whatsapp\.com|connect\.facebook|twitter\.com|x\.com|pinterest\.com|google\.com|googleusercontent\.com|gstatic\.com/i;

/** Signs in through the provider row inside the comment box. */
async function signIn(page: import('@playwright/test').Page, provider = 'Google') {
  await page.getByRole('button', { name: new RegExp(provider) }).click();
  await expect(page.locator('bah-comment-section textarea')).toBeVisible();
}

test.describe('reactions', () => {
  test('anyone may react, without signing in', async ({ page }) => {
    await page.goto(BABKA);

    const bar = page.locator('bah-reaction-bar');
    await expect(bar).toContainText('0 réaction');

    await page.getByRole('button', { name: 'Réagir' }).click();
    await expect(bar).toContainText('1 réaction');
    await expect(page.getByRole('button', { name: 'Réagir' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('reacting twice toggles off rather than counting twice', async ({ page }) => {
    await page.goto(BABKA);
    const react = page.getByRole('button', { name: 'Réagir' });
    const bar = page.locator('bah-reaction-bar');

    await react.click();
    await expect(bar).toContainText('1 réaction');

    await react.click();
    await expect(bar).toContainText('0 réaction');
    await expect(react).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('rating', () => {
  test('rating replaces the visitor’s own score instead of stacking votes', async ({ page }) => {
    await page.goto(BABKA);

    // Seeded at 4.0 from a single vote.
    await expect(page.locator('.meta')).toContainText('4.0 / 5');
    await expect(page.locator('.meta')).toContainText('1 avis');

    await page.getByRole('radio', { name: '5 étoiles' }).click();
    await expect(page.locator('.meta')).toContainText('2 avis');
    await expect(page.locator('.meta')).toContainText('4.5 / 5');

    // Changing your mind must move the average without adding a third vote.
    await page.getByRole('radio', { name: '2 étoiles' }).click();
    await expect(page.locator('.meta')).toContainText('2 avis');
    await expect(page.locator('.meta')).toContainText('3.0 / 5');
  });

  test('the stars show your own score back, not the crowd average', async ({ page }) => {
    await page.goto(BABKA);
    await page.getByRole('radio', { name: '2 étoiles' }).click();

    await expect(page.locator('.thanks')).toBeVisible();
    await expect(page.getByRole('radio', { name: '2 étoiles' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

test.describe('comments', () => {
  test('shows the seeded thread and invites a signed-out visitor to identify', async ({ page }) => {
    await page.goto(BABKA);

    await expect(page.locator('bah-comment-section h2')).toHaveText('2 commentaires');
    await expect(page.locator('bah-comment-section .comment')).toHaveCount(2);
    await expect(page.locator('bah-comment-section .prompt')).toHaveText(
      "S'identifier pour pouvoir commenter",
    );
    // No box to type in until there is a name to attach.
    await expect(page.locator('bah-comment-section textarea')).toHaveCount(0);
  });

  test('another visitor’s comment awaiting moderation is not public reading', async ({ page }) => {
    // Shakshuka seeds one published comment and one PENDING. Only the published
    // one may appear — a moderation queue is not a comment section.
    await page.goto(SHAKSHUKA);

    await expect(page.locator('bah-comment-section h2')).toHaveText('1 commentaire');
    await expect(page.locator('bah-comment-section')).toContainText('Yasmine');
    await expect(page.locator('bah-comment-section')).not.toContainText('premier !!!');
  });

  test('offers one button per configured provider, and no others', async ({ page }) => {
    // The list comes from the API, not from the source of this page: switching a
    // provider on is deployment configuration (ADR 0003).
    await page.goto(BABKA);

    const buttons = page.locator('bah-sign-in-row button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toContainText('Google');
    await expect(buttons.nth(1)).toContainText('Facebook');
  });

  test('signing in, writing, previewing and posting', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    await page.locator('bah-comment-section textarea').fill('**Excellente** recette.');

    // Preview renders the markdown through the sanitizing component rather than
    // showing the raw asterisks.
    await page.getByRole('tab', { name: 'Aperçu' }).click();
    await expect(page.locator('bah-comment-section .preview strong')).toHaveText('Excellente');

    await page.getByRole('button', { name: 'Publier' }).click();

    await expect(page.locator('bah-comment-section h2')).toHaveText('3 commentaires');
    await expect(page.locator('bah-comment-section .comment').first()).toContainText('Hédi');
    await expect(page.locator('bah-comment-section .comment strong').first()).toHaveText(
      'Excellente',
    );
  });

  test('the toolbar wraps the selection, and the preview shows the result', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    const editor = page.locator('bah-comment-section textarea');
    await editor.fill('Une recette parfaite.');

    // Select the word "parfaite" and embolden it.
    await editor.evaluate((node: HTMLTextAreaElement) => {
      const at = node.value.indexOf('parfaite');
      node.setSelectionRange(at, at + 'parfaite'.length);
    });
    await page.getByRole('button', { name: 'Gras' }).click();

    await expect(editor).toHaveValue('Une recette **parfaite**.');

    // The round trip that matters: what the toolbar writes has to be what the
    // renderer understands. A toolbar emitting a syntax the preview does not
    // render would look broken in exactly the place people check.
    await page.getByRole('tab', { name: 'Aperçu' }).click();
    await expect(page.locator('bah-comment-section .preview strong')).toHaveText('parfaite');
  });

  test('every mark the toolbar offers survives into the posted comment', async ({ page }) => {
    // Half of the guard against the two renderers drifting apart. This suite
    // runs on the mocks, where a posted comment is rendered client-side, so what
    // this proves is that the browser's renderer understands everything the
    // toolbar emits. The other half — that the server agrees — is
    // MarkdownRendererTest.rendersEveryMarkTheCommentToolbarCanProduce, and
    // neither is worth much without the other.
    await page.goto(BABKA);
    await signIn(page);

    await page
      .locator('bah-comment-section textarea')
      .fill('**gras** et *penché* et ~~barré*~~\n\n> une citation\n\n- une puce');

    await page.getByRole('button', { name: 'Publier' }).click();

    const posted = page.locator('bah-comment-section .comment').first();
    await expect(posted.locator('strong')).toHaveText('gras');
    await expect(posted.locator('em')).toHaveText('penché');
    await expect(posted.locator('del')).toHaveText('barré*');
    await expect(posted.locator('blockquote')).toContainText('une citation');
    await expect(posted.locator('li')).toHaveText('une puce');
  });

  test('Ctrl+B formats, and Ctrl+Z still undoes it', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    const editor = page.locator('bah-comment-section textarea');
    await editor.fill('Une recette parfaite.');
    await editor.evaluate((node: HTMLTextAreaElement) => {
      const at = node.value.indexOf('parfaite');
      node.setSelectionRange(at, at + 'parfaite'.length);
    });

    await page.keyboard.press('Control+b');
    await expect(editor).toHaveValue('Une recette **parfaite**.');

    // The whole reason the component writes through execCommand instead of
    // assigning the value: assigning wipes the browser's undo stack, so Ctrl+Z
    // after a toolbar press would throw away everything the visitor had typed.
    await page.keyboard.press('Control+z');
    await expect(editor).toHaveValue('Une recette parfaite.');
  });

  test('the preview styles a quote as a quote, not just as an element', async ({ page }) => {
    // The other half of the same defect: the Preview tab is the one place a
    // person deliberately looks at formatting before committing to it, so a
    // blockquote rendering with no bar and browser-default indent is exactly
    // where it would mislead.
    await page.goto(BABKA);
    await signIn(page);

    await page.locator('bah-comment-section textarea').fill('> une citation');
    await page.getByRole('tab', { name: 'Aperçu' }).click();

    const quote = page.locator('bah-comment-section .preview blockquote');
    await expect(quote).toBeVisible();

    const style = await quote.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { border: computed.borderLeftWidth, padding: computed.paddingLeft };
    });

    expect(style.border, 'the blockquote has no accent bar').toBe('2px');
    expect(style.padding, 'the blockquote is not indented by its own rule').toBe('14px');
  });

  test('the formatting toolbar is one tab stop, with arrow keys inside it', async ({ page }) => {
    // Six separate tab stops in front of the textarea would make reaching the
    // box slower for every keyboard user in order to help nobody.
    await page.goto(BABKA);
    await signIn(page);

    const tools = page.locator('bah-comment-section .tool');
    await expect(tools).toHaveCount(6);
    await expect(tools.nth(0)).toHaveAttribute('tabindex', '0');
    await expect(tools.nth(1)).toHaveAttribute('tabindex', '-1');

    await tools.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tools.nth(1)).toBeFocused();
    await expect(tools.nth(1)).toHaveAttribute('tabindex', '0');
    await expect(tools.nth(0)).toHaveAttribute('tabindex', '-1');
  });

  test('a signed comment shows a chosen avatar and fetches no picture to do it', async ({
    page,
  }) => {
    // The assertion that would have caught the leak ADR 7 fixes. A commenter's
    // avatar was the URL the provider returned, so a thread of signed comments
    // made the reader's browser call Google — and because it renders perfectly,
    // nothing but a request log shows it.
    const contacted: string[] = [];
    page.on('request', (request) => {
      if (THIRD_PARTY.test(request.url())) contacted.push(request.url());
    });

    await page.goto(BABKA);
    await signIn(page);
    await page.locator('bah-comment-section textarea').fill('Avec un peu de fleur de sel.');
    await page.getByRole('button', { name: 'Publier' }).click();

    const avatar = page.locator('bah-comment-section .comment').first().locator('bah-avatar');

    // Drawn from the icon registry, on the tint the account chose.
    await expect(avatar.locator('.disc svg')).toBeVisible();

    // No <img> anywhere in it: an avatar that is an image is an avatar fetched
    // from somewhere, whoever is hosting it.
    await expect(avatar.locator('img')).toHaveCount(0);

    expect(contacted, 'a comment thread must cost the reader no third-party request').toEqual([]);
  });

  test('posting returns to the write tab with an empty box', async ({ page }) => {
    // Posting from Preview and staying there leaves an empty preview pane, which
    // reads as the comment having vanished.
    await page.goto(BABKA);
    await signIn(page);

    await page.locator('bah-comment-section textarea').fill('Testé et approuvé.');
    await page.getByRole('tab', { name: 'Aperçu' }).click();
    await page.getByRole('button', { name: 'Publier' }).click();

    await expect(page.getByRole('tab', { name: 'Écrire' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('bah-comment-section textarea')).toHaveValue('');
  });

  test('an empty comment cannot be posted', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    await expect(page.getByRole('button', { name: 'Publier' })).toBeDisabled();

    // Whitespace is still empty.
    await page.locator('bah-comment-section textarea').fill('   ');
    await expect(page.getByRole('button', { name: 'Publier' })).toBeDisabled();
  });

  test('you may delete your own comment and only your own', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    await page.locator('bah-comment-section textarea').fill('À supprimer.');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.locator('bah-comment-section .comment')).toHaveCount(3);

    // Exactly one delete button: the two seeded comments belong to other people.
    const remove = page.locator('bah-comment-section .delete');
    await expect(remove).toHaveCount(1);

    await remove.click();
    await expect(page.locator('bah-comment-section .comment')).toHaveCount(2);
  });

  test('the session survives a reload, as a real cookie would', async ({ page }) => {
    await page.goto(BABKA);
    await signIn(page);

    await page.reload();
    // No sign-in prompt on the way back: a mock that forgot you would make the
    // finished product look broken in a way it will not be.
    await expect(page.locator('bah-comment-section textarea')).toBeVisible();
    await expect(page.locator('bah-comment-section .prompt')).toHaveCount(0);
  });

  test('signing out returns the visitor to the prompt', async ({ page }) => {
    // Signing out moved out of the header when there was finally an account page
    // to put it on (ADR 7): the header control was a single unlabelled click that
    // ended your session, and it now opens the profile instead.
    await page.goto(BABKA);
    await signIn(page);

    await page.getByRole('link', { name: 'Mon compte' }).first().click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();

    // Waited for, not assumed. The profile page navigates home once the sign-out
    // has actually completed, and the mock takes a moment on purpose — leaving
    // for another page first reads the session back before it has been cleared,
    // and the visitor arrives still signed in.
    await expect(page).toHaveURL(/\/fr$/);

    await page.goto(BABKA);
    await expect(page.locator('bah-comment-section .prompt')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveCount(0);
  });

  test('the write/preview tabs are a real tablist, reachable by keyboard', async ({ page }) => {
    // The prototype drew two styled spans. Those are unreachable and unannounced,
    // so they are buttons in a tablist with arrow-key movement.
    await page.goto(BABKA);
    await signIn(page);

    const write = page.getByRole('tab', { name: 'Écrire' });
    await expect(write).toHaveAttribute('aria-selected', 'true');

    await write.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Aperçu' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.keyboard.press('ArrowLeft');
    await expect(write).toHaveAttribute('aria-selected', 'true');
  });

  test('the tabs are inert until there is an account', async ({ page }) => {
    await page.goto(BABKA);
    await expect(page.getByRole('tab', { name: 'Écrire' })).toBeDisabled();
    await expect(page.getByRole('tab', { name: 'Aperçu' })).toBeDisabled();
  });
});

test.describe('sharing', () => {
  test('contacts no social network merely because the page was opened', async ({ page }) => {
    // The same rule the YouTube facade exists for. A Facebook or X share widget
    // would load its SDK here and disclose the visitor's IP to a network that
    // was never asked to read a recipe, which is why every target is a plain
    // link instead.
    const contacted: string[] = [];
    page.on('request', (request) => {
      if (THIRD_PARTY.test(request.url())) contacted.push(request.url());
    });

    await page.goto(BABKA, { waitUntil: 'networkidle' });

    await expect(page.locator('bah-share-bar')).toBeVisible();
    expect(contacted, 'sharing must cost nothing until it is used').toEqual([]);
  });

  test('every target is a plain link carrying this page’s address', async ({ page }) => {
    await page.goto(BABKA);

    const links = page.locator('bah-share-bar a');
    await expect(links).toHaveCount(4);

    // Taken from the page rather than rebuilt from a hardcoded origin: the
    // share links carry whatever address this page actually has, and pinning
    // the port here made the spec fail the moment the suite moved off 4200.
    const encoded = encodeURIComponent(page.url());
    for (const href of await links.evaluateAll((all) =>
      all.map((a) => (a as HTMLAnchorElement).href),
    )) {
      expect(href).toContain(encoded);
    }
  });

  test('opens share targets without handing them a window reference', async ({ page }) => {
    // target=_blank without rel=noopener gives the opened page control of this one.
    await page.goto(BABKA);

    for (const rel of await page
      .locator('bah-share-bar a')
      .evaluateAll((all) => all.map((a) => a.getAttribute('rel')))) {
      expect(rel).toContain('noopener');
    }
  });

  test('copying the link reports success to a screen reader', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BABKA);

    await page.getByRole('button', { name: 'Copier le lien' }).click();

    // The icon swapping to a tick is invisible to a screen reader, so the
    // confirmation has to be announced.
    await expect(page.locator('bah-share-bar [role="status"]')).toHaveText('Lien copié');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      '/fr/recettes/babka-au-chocolat',
    );
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the social block fits without scrolling the page sideways', async ({ page }) => {
    // The classic failure: a flex row of provider buttons, or a comment body
    // with a long unbroken URL, pushes the document wider than the viewport and
    // the whole site starts scrolling horizontally.
    await page.goto(BABKA);
    await expect(page.locator('bah-comment-section')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page must not scroll horizontally').toBeLessThanOrEqual(0);
  });

  test('the provider buttons stack instead of wrapping mid-word', async ({ page }) => {
    await page.goto(BABKA);

    // The provider list is fetched, so wait for it rather than measuring an
    // empty row and concluding the layout is fine.
    const buttons = page.locator('bah-sign-in-row button');
    await expect(buttons).toHaveCount(2);

    const boxes = await buttons.evaluateAll((all) =>
      all.map((b) => b.getBoundingClientRect().top),
    );

    expect(boxes[0], 'two providers cannot sit side by side at 390px').not.toBe(boxes[1]);
  });
});

test.describe('english locale', () => {
  test('the whole social block is translated', async ({ page }) => {
    await page.goto('/en/recipes/chocolate-babka');

    await expect(page.locator('bah-comment-section h2')).toHaveText('2 comments');
    await expect(page.locator('bah-comment-section .prompt')).toHaveText(
      'Sign in to leave a comment',
    );
    await expect(page.locator('bah-reaction-bar')).toContainText('0 reactions');
    await expect(page.locator('bah-share-bar')).toContainText('Share');
  });

  test('a comment is not translated with the page around it', async ({ page }) => {
    // Comments are written once by a visitor and stay in their own language on
    // both trees. Nobody translates a stranger's remark about a babka.
    await page.goto('/en/recipes/chocolate-babka');
    await expect(page.locator('bah-comment-section')).toContainText('Faite hier soir');
  });
});
