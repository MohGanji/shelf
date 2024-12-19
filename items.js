const posts = [
  {
    title: "How computers evolved",
    url: 'computer',
    subtitle: '',
    date: '2024-12',
  },
  {
    title: "Space on a pedestal",
    url: 'space',
    subtitle: '',
    date: '2024-09',
  },
  {
    title: "Things you cannot learn from reading books",
    url: 'not-in-books',
    subtitle: '',
    date: '2024-08',
  },
  {
    title: "Steve",
    url: 'steve',
    subtitle: '',
    date: '2024-07',
  },
  {
    title: "1 + 1 > 2",
    url: 'one-plus-one',
    subtitle: '',
    date: '2024-06',
  },
  {
    title: "What a perfectionist creates",
    url: 'perfectionism',
    subtitle: '',
    date: '2024-05',
  },
  {
    title: 'My Favorite Blog Posts, A Growing List',
    url: 'fav-blogs',
    subtitle: '',
    date: '2024-04',
  },
  {
    title: 'The Shelf',
    url: 'the-shelf',
    subtitle: '',
    date: '2024-03',
  },
  {
    title: 'Life is like an apple',
    url: 'apple',
    subtitle: '',
    date: '2024-02',
  },
  {
    title: 'Standup Reading',
    url: 'standup-reading',
    subtitle: '',
    date: '2023-02',
  },
  {
    title: 'There is no right way, only your way',
    url: 'right-way',
    subtitle: '',
    date: '2023-02',
  },
  {
    title: 'Math can be fun, they said',
    url: 'grahams-number',
    subtitle: '',
    date: '2023-01',
  },
  {
    title: "Do it 100 times first, then we'll talk",
    url: '100',
    subtitle: '',
    date: '2023-01',
  },
  {
    title: 'The boy, the mole, the fox and the horse',
    url: 'boy mole fox horse',
    subtitle: '',
    date: '2023-01',
  },
  {
    title: 'I built a blog post dispenser',
    url: 'blogfrog',
    subtitle: `
            I was working, after a half hour or so, I unconciously opened a new tab, typed in: "twitter.com".
            Next thing I know is I'm doomscrolling down my twitter feed for an hour.
            This is me every day. 
            <br>
            There's also another side of me, that likes to read blogs.
            There are a lot of interesting people on the internet writing cool stuff in their blogs.
            I learn a lot reading those and getting to know those people.
            But I never seem to find the time to read these blogs constantly, and deciding which blog to open? Don't even open that door.
            <br>
            So I built <i>BlogFrog</i>.
            It's a simple website with one button, that's all.
            So now every time I get tired of work, or I want to lose focus, I open <i>BlogFrog</i>.
            I let the button take me somewhere random on the internet. I read one blog post, learn something, and I get back to work. 
            Because there is no infinite scrolling feed after that.
        `,
    link: 'blogfrog.xyz',
    date: '2022-07',
  },
  {
    title: 'Afraid of what people might think?',
    url: 'The Courage to Be Disliked',
    subtitle: `
            This book combines philosophy with psychology in a story format.
            It's a dialouge between a wise old man and an inexperienced curious young person.
            It expands on the Adlerian psychology, on how there is always an internal purpose that justifies our actions(or inactions).
            It provides controversial and eye-opening views on self-worth, confidence, fear, trauma, superiority, subjectiveness of our worlds, and the meaning of community.
        `,
    date: '2021-12',
  },
  {
    title: 'Why you should start a blog',
    url: 'Why you should start a blog',
    subtitle: `
        Have you ever thought why you follow so many people on social media? 
        Maybe you share their interests, or maybe you just enjoy seeing other people do normal things. 
        Thinking is also a normal thing we all do, and thoughts can also be interesting...
        `,
    date: '2021-11',
  },
  // title: engaging, teasing title, should be enough to get a click.
  // url: the last portion of the url, should be short, one or two word thingy, memorable.
  // subtitle, will not appear here, but will be used for other socials for engagement.
  // date: just to have a list of how frequently I'm writing.
]
let items = posts.map((post) => Templates.blogpost(post.title, post.url, post.subtitle, post.date))
let containerElement = document.getElementById('items-container')
items.forEach((item) => containerElement.appendChild(item))
