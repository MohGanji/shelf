const books = [
    {
        title: 'The Courage to Be Disliked',
        subtitle: `
            some stuff I want to say about this book
            in three lines 
            some
        `,
        author: 'Ichiro Kishimi',
        link: '...',
        recommendTo: 'everyone',
        rating: 10,
        date: '2021-12',
    },
    {
        title: 'Essentialism',
        subtitle: 'A curious minimalist adventurer with exceptional prose writing ability, and radical mindset and counter-intuitive useful ideas.',
        author: 'Greg McKeown',
        link: '',
        recommendTo: 'everyone',
        rating: 10,
        date: '2020-06',
    },
]
let items = books.map((b) => Templates.book(b.title, b.subtitle, b.author, b.recommendTo, b.date, b.link, b.rating))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))