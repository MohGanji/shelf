// BlogFrog -- press the button, land on a random post from someone else's blog.
//
// Originally (2022) this fetched each blog's archive at click time through a CORS proxy and
// parsed it in the browser. That proxy is gone. Discovery now happens ahead of time in CI
// (tools/harvest.mjs -> posts.js), so a click is just a redirect: no fetch, no parsing, no
// third-party dependency, and it works over https. Blogs that publish their own random-post
// endpoint are still hit live, so those never go stale at all.

const BLOGS = (typeof BLOG_INDEX !== 'undefined' && BLOG_INDEX.blogs) || {};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A blog is usable if it has a live random endpoint or at least one indexed post.
function usableBlogs() {
  return Object.keys(BLOGS).filter(
    (k) => BLOGS[k].random || (BLOGS[k].posts && BLOGS[k].posts.length)
  );
}

function totalPosts() {
  return Object.values(BLOGS).reduce((n, b) => n + (b.posts ? b.posts.length : 0), 0);
}

function select() {
  const btn = document.getElementById('go-btn');
  if (btn.classList.contains('disabled')) return;

  const names = usableBlogs();
  if (!names.length) return _showError();

  const name = pick(names);
  const blog = BLOGS[name];
  const url = blog.random || pick(blog.posts);

  _disableButton();
  addReadCount(name);

  // Navigate even if analytics is blocked or slow -- createFunctionWithTimeout fires the
  // callback on its own after the timeout, so an ad blocker cannot strand the button.
  return gtag('event', 'bf_go_click', {
    event_callback: createFunctionWithTimeout(() => _redirectTo(url), 500),
  });
}

function _redirectTo(url) {
  window.location.href = url;
  // Re-enable on the way out: if the user comes back via the back button, some browsers
  // restore the page from cache with the button still disabled.
  setTimeout(_enableButton, 1500);
}

function _disableButton() {
  document.getElementById('go-btn').classList.add('disabled');
  document.getElementById('btn-text').innerText = 'Hopping...';
}

function _enableButton() {
  document.getElementById('go-btn').classList.remove('disabled');
  document.getElementById('btn-text').innerText = 'Take Me Somewhere';
}

function _showError() {
  document.getElementById('btn-text').innerText = 'Index unavailable';
}

window.addEventListener('pageshow', _enableButton);

///// STATS
var C_BLOGS_KEY = 'BF__BLOGS';
var C_READ_CNT_KEY = 'BF__READ_CNT';

function addReadCount(blogName) {
  const readCnt = localStorage.getItem(C_READ_CNT_KEY) || '0';
  localStorage.setItem(C_READ_CNT_KEY, `${+readCnt + 1}`);

  const discovered = new Set(JSON.parse(localStorage.getItem(C_BLOGS_KEY) || '[]'));
  discovered.add(blogName);
  localStorage.setItem(C_BLOGS_KEY, JSON.stringify([...discovered]));
}

function refreshStats() {
  const readCnt = localStorage.getItem(C_READ_CNT_KEY) || '0';
  document.getElementById('posts-read-cnt').innerText = readCnt;
  document.getElementById('twitter-posts-read').setAttribute(
    'href',
    generateShareUrl(`I landed on ${readCnt} blog posts with BlogFrog so far.\nStart hopping!\n\n`, ['blogfrog'])
  );

  const blogsCnt = JSON.parse(localStorage.getItem(C_BLOGS_KEY) || '[]').length;
  document.getElementById('blogs-discovered-cnt').innerText = blogsCnt;
  document.getElementById('twitter-blogs-discovered').setAttribute(
    'href',
    generateShareUrl(`I discovered ${blogsCnt} new blogs using BlogFrog.\nStart hopping!\n\n`, ['blogfrog'])
  );

  // The headline number is indexed posts, which understates slightly: the four blogs with
  // live random endpoints have no countable list, so they contribute nothing here.
  const total = document.getElementById('posts-total');
  if (total) total.innerText = totalPosts().toLocaleString();
}

function generateShareUrl(text, hashtags) {
  const url = 'https://ganji.me/vibe/blogfrog/';
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${hashtags.join(',')}`;
}

///// ANALYTICS
function handleWebsiteClick() {
  return gtag('event', 'bf_website_click', {
    event_callback: createFunctionWithTimeout(() => {
      window.location.href = '/';
    }, 500),
  });
}

function handleContactClick() {
  return gtag('event', 'bf_contact_click', {
    event_callback: createFunctionWithTimeout(() => {
      window.location.href = 'mailto:mohganji97@gmail.com';
    }, 500),
  });
}

function createFunctionWithTimeout(callback, opt_timeout) {
  var called = false;
  function fn() {
    if (!called) {
      called = true;
      callback();
    }
  }
  setTimeout(fn, opt_timeout || 1000);
  return fn;
}

refreshStats();
