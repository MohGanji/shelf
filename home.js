/**
 * Renders the homepage's data-driven sections from the site's data files:
 * `projects` (portfolio.js), `vibeProjects` (vibe/projects.js), `posts` (items.js).
 */

/** Titles must match portfolio.js entries. */
const FEATURED_PROJECTS = ['mindmap.io', 'tron.ganji.me', 'mohganji/skills', 'Braindump', 'JScope'];
const VIBE_SHOWN = 6;
const POSTS_SHOWN = 6;

const homeEl = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
};

const postRow = (post) => homeEl(`
    <a class="post-row" href="./${Util.fmt(post.url)}.html">
        <span class="post-row-title">${post.title}</span>
        <span class="post-row-date">${post.date}</span>
    </a>
`);

// Featured Projects
const featuredContainer = document.getElementById('featured-projects');
if (featuredContainer) {
    FEATURED_PROJECTS.forEach((title) => {
        const p = projects.find((x) => x.title === title);
        if (!p) return;
        featuredContainer.appendChild(homeEl(`
            <div class="featured-row">
                <img class="featured-thumb" src="${p.image}" alt="" loading="lazy">
                <span class="featured-text">
                    <a class="home-item-title" href="${p.link}">${p.title}</a>
                    <span class="home-dim">${p.blurb || p.description}</span>
                </span>
            </div>
        `));
    });
    document.getElementById('featured-all').textContent = `all ${projects.length} →`;
}

// Vibe
const vibeContainer = document.getElementById('vibe-grid');
if (vibeContainer) {
    const vibes = vibeProjects.filter((p) => !p.hidden);
    vibes.slice(0, VIBE_SHOWN).forEach((p) => {
        // note may contain <a> tags, so the card title is the only outer link
        vibeContainer.appendChild(homeEl(`
            <div class="vibe-card">
                <a class="home-item-title" href="${p.url.replace('./', '/vibe/')}">${p.title}</a>
                <span class="home-dim vibe-note">${p.note}</span>
                <span class="vibe-badges">
                    ${p.model ? `<span class="vibe-badge">${p.model}</span>` : ''}
                    <span class="vibe-badge vibe-badge-dim">${p.date}</span>
                </span>
            </div>
        `));
    });
    document.getElementById('vibe-all').textContent = `all ${vibes.length} →`;
}

// Writing: latest posts, with a button expanding the full list in place
const writingContainer = document.getElementById('writing-list');
if (writingContainer) {
    posts.slice(0, POSTS_SHOWN).forEach((p) => writingContainer.appendChild(postRow(p)));
    const rest = homeEl('<div class="home-hidden"></div>');
    posts.slice(POSTS_SHOWN).forEach((p) => rest.appendChild(postRow(p)));
    writingContainer.appendChild(rest);
    const moreBtn = homeEl(`<button class="home-more-btn">all ${posts.length} →</button>`);
    moreBtn.addEventListener('click', () => {
        rest.classList.remove('home-hidden');
        moreBtn.remove();
    });
    writingContainer.appendChild(moreBtn);
}
