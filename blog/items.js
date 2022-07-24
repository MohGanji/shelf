const posts = [
    {
        title: 'Why you should start a blog',
        subtitle: `
        Have you ever thought why you follow so many people on social media? 
        Maybe you share their interests, or maybe you just enjoy seeing other people do normal things. 
        Thinking is also a normal thing we all do, and thoughts can also be interesting...
        `,
        date: '2021-11',
    }
]
let items = posts.map((post) => Templates.blogpost(post.title, post.subtitle, post.date))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))