import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpRecipeApi } from './http-recipe-api';
import { HttpSocialApi } from './http-social-api';
import { HttpAuthApi } from './http-auth-api';
import { HttpAdminApi } from './http-admin-api';

/**
 * What each implementation actually puts on the wire.
 *
 * These are the only tests that touch this code at all: the e2e suite runs
 * against the mocks, so without them the whole HTTP half of the seam would ship
 * unexecuted. What is worth asserting is not "it calls the server" but the
 * handful of places where the contract says something specific — a 404 becoming
 * `null` rather than a throw, the search box being filtered in the browser, a
 * 204 being read as "nobody is signed in".
 *
 * The URLs are asserted too, because a path that is right in spirit and spells
 * `/api/recipe/` produces a 404 the frontend then reports as an empty page.
 */

function setUp<T>(api: new () => T): { api: T; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), api],
  });

  return { api: TestBed.inject(api), http: TestBed.inject(HttpTestingController) };
}

describe('HttpRecipeApi', () => {
  let api: HttpRecipeApi;
  let http: HttpTestingController;

  beforeEach(() => ({ api, http } = setUp(HttpRecipeApi)));

  it('sends the filters the server owns, and only those', async () => {
    const promise = api.list({ locale: 'fr', tag: 'dessert', author: 'hedi', sort: 'oldest' });

    const request = http.expectOne(
      (r) => r.url === '/api/recipes' && r.params.get('tag') === 'dessert',
    );
    expect(request.request.params.get('locale')).toBe('fr');
    expect(request.request.params.get('author')).toBe('hedi');
    expect(request.request.params.get('sort')).toBe('oldest');

    request.flush({ items: [], page: 0, size: 0, total: 0 });
    await promise;
  });

  it('filters the search box in the browser rather than asking the server', async () => {
    // searchText is on every summary precisely so this can happen here. Sending
    // the query instead would mean a round trip per keystroke, or shipping every
    // ingredient row for every card.
    const promise = api.list({ locale: 'fr', query: 'chocolat' });

    const request = http.expectOne((r) => r.url === '/api/recipes');
    expect(request.request.params.has('query')).toBe(false);

    request.flush({
      items: [
        { slug: 'babka', searchText: 'Babka au chocolat' },
        { slug: 'pain', searchText: 'Pain au levain' },
      ],
      page: 0,
      size: 2,
      total: 2,
    });

    const page = await promise;
    expect(page.items.map((item) => item.slug)).toEqual(['babka']);
    expect(page.total).toBe(1);
  });

  it('reads a 404 as no such recipe rather than as an error', async () => {
    // A draft, an unknown slug and a slug from the other language are all 404,
    // and all three are a 404 page here rather than a thrown error state.
    const promise = api.bySlug('jus-grenade-orange', 'fr');
    http.expectOne((r) => r.url === '/api/recipes/jus-grenade-orange').flush(null, { status: 404, statusText: 'Not Found' });

    await expect(promise).resolves.toBeNull();
  });

  it('lets a real failure through instead of reporting an empty page', async () => {
    const promise = api.bySlug('babka', 'fr');
    http.expectOne((r) => r.url === '/api/recipes/babka').flush(null, { status: 500, statusText: 'Server Error' });

    await expect(promise).rejects.toBeDefined();
  });

  it('encodes a slug rather than pasting it into the path', async () => {
    const promise = api.bySlug('crème brûlée', 'fr');
    http.expectOne((r) => r.url === '/api/recipes/cr%C3%A8me%20br%C3%BBl%C3%A9e').flush({});
    await promise;
  });
});

describe('HttpSocialApi', () => {
  let api: HttpSocialApi;
  let http: HttpTestingController;

  beforeEach(() => ({ api, http } = setUp(HttpSocialApi)));

  it('rates with PUT, because rating again replaces rather than adds', async () => {
    const promise = api.rate('babka-au-chocolat', 5, 'fr');

    const request = http.expectOne('/api/recipes/babka-au-chocolat/rating?locale=fr');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ stars: 5 });

    request.flush({ average: 4.5, count: 2, yourRating: 5 });
    expect(await promise).toEqual({ average: 4.5, count: 2, yourRating: 5 });
  });

  it('toggles a reaction off with the same call and a false', async () => {
    const promise = api.react('babka-au-chocolat', false, 'fr');

    const request = http.expectOne('/api/recipes/babka-au-chocolat/reaction?locale=fr');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ reacted: false });

    request.flush({ count: 0, reacted: false });
    await promise;
  });

  it('returns the comment the server created, not the one that was sent', async () => {
    // Moderation is the server's decision, so the answer may be PENDING.
    const promise = api.addComment('babka-au-chocolat', 'Bonjour', 'fr');

    const request = http.expectOne('/api/recipes/babka-au-chocolat/comments?locale=fr');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ bodyMarkdown: 'Bonjour' });

    request.flush({ id: 9, status: 'PENDING', mine: true });
    expect((await promise).status).toBe('PENDING');
  });

  it('deletes a comment by id, with no locale', async () => {
    // A comment has one id across both languages, unlike a recipe slug.
    const promise = api.deleteComment(9);

    const request = http.expectOne('/api/comments/9');
    expect(request.request.method).toBe('DELETE');

    request.flush(null);
    await promise;
  });
});

describe('HttpAuthApi', () => {
  let api: HttpAuthApi;
  let http: HttpTestingController;
  let navigations: string[];

  // Its own setup rather than the shared one: signing in is a navigation, so
  // the window it navigates has to be something this test can watch.
  beforeEach(() => {
    navigations = [];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpAuthApi,
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: {
              location: {
                pathname: '/fr/recettes/babka-au-chocolat',
                search: '',
                assign: (url: string) => navigations.push(url),
              },
            },
          },
        },
      ],
    });

    api = TestBed.inject(HttpAuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('reports no session as null rather than as a failure', async () => {
    // The server answers 204 with no body, which Angular reads as null. Being
    // anonymous is the normal state of almost every request to this site.
    const promise = api.session();
    http.expectOne('/api/auth/session').flush(null, { status: 204, statusText: 'No Content' });

    await expect(promise).resolves.toBeNull();
  });

  it('passes an empty provider list through untouched', async () => {
    // Zero providers is a real answer and means sign-in is switched off. The
    // sign-in row renders an unavailable notice from exactly this.
    const promise = api.providers();
    http.expectOne('/api/auth/providers').flush([]);

    expect(await promise).toEqual([]);
  });

  it('signs out with a POST, so that CSRF applies to it', async () => {
    const promise = api.signOut();

    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');

    request.flush(null);
    await promise;
  });

  it('starts sign-in by leaving the application, not by fetching', async () => {
    // The authorization endpoint sets state in the session and answers 302 to
    // Google; neither survives being fetched. So this is a navigation, and no
    // request is made at all.
    let settled = false;
    void api.signIn('google').then(() => {
      settled = true;
    });
    await Promise.resolve();

    // Carries the page being left, so the server can send them back to it. Its
    // absence is what used to drop everyone on the home page after signing in.
    expect(navigations).toEqual([
      '/oauth2/authorization/google?returnTo=%2Ffr%2Frecettes%2Fbabka-au-chocolat',
    ]);
    http.expectNone(() => true);

    // Never settles on purpose: the document is being torn down, and anything
    // sequenced after this would run in a page that is going away. AuthService
    // calls init() after signIn(), and it must not reach it here.
    expect(settled).toBe(false);
  });

  it('prefers an explicit returnTo over the page it is on', async () => {
    // What makes the dedicated sign-in page work: signing in from there has to
    // return you where you were when you clicked, not to the page you are
    // standing on and have just finished with.
    const view = TestBed.inject(DOCUMENT).defaultView as unknown as {
      location: { pathname: string; search: string };
    };
    view.location.pathname = '/fr/connexion';
    view.location.search = '?returnTo=%2Ffr%2Frecettes%2Fbabka-au-chocolat';

    void api.signIn('google');
    await Promise.resolve();

    expect(navigations).toEqual([
      '/oauth2/authorization/google?returnTo=%2Ffr%2Frecettes%2Fbabka-au-chocolat',
    ]);
  });
});

describe('HttpAdminApi', () => {
  let api: HttpAdminApi;
  let http: HttpTestingController;

  beforeEach(() => ({ api, http } = setUp(HttpAdminApi)));

  it('asks the server what an empty recipe looks like', async () => {
    // One definition of "empty", rather than a second copy of the shape here
    // that would drift from the one the save endpoint validates against.
    const promise = api.blank();
    http.expectOne('/api/admin/recipes/blank').flush({ key: '', status: 'DRAFT' });

    expect((await promise).key).toBe('');
  });

  it('reads a 404 draft as null so the editor can render its own 404', async () => {
    const promise = api.draft('nexiste-pas');
    http
      .expectOne('/api/admin/recipes/nexiste-pas')
      .flush(null, { status: 404, statusText: 'Not Found' });

    await expect(promise).resolves.toBeNull();
  });

  it('saves with PUT and sends the draft as it stands', async () => {
    const draft = { key: 'babka', status: 'PUBLISHED' } as never;
    const promise = api.save(draft);

    const request = http.expectOne('/api/admin/recipes');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe(draft);

    request.flush(null);
    await promise;
  });

  it('changes a status without sending a whole draft', async () => {
    const promise = api.setStatus('babka', 'ARCHIVED');

    const request = http.expectOne('/api/admin/recipes/babka/status');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ status: 'ARCHIVED' });

    request.flush(null);
    await promise;
  });

  it('moderates by id, saying only whether it was approved', async () => {
    const promise = api.moderate(4, false);

    const request = http.expectOne('/api/admin/comments/4/moderate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ approve: false });

    request.flush(null);
    await promise;
  });
});
