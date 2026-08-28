/**
 * The homepage's Featured Projects, Vibe and Writing lists are generated into index.html by
 * tools/seo.mjs, so they are real HTML by the time this runs. All that is left is the
 * toggle that reveals the rest of the posts.
 *
 * Change a post in items.js, then run `node tools/seo.mjs` to fold it into the page.
 */

const moreBtn = document.querySelector('.home-more-btn');
const hiddenPosts = document.querySelector('#writing-list .home-hidden');

if (moreBtn && hiddenPosts) {
    moreBtn.addEventListener('click', () => {
        hiddenPosts.classList.remove('home-hidden');
        moreBtn.remove();
    });
}
