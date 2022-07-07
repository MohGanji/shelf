const books = [
    {
        title: 'The Courage to Be Disliked',
        subtitle: `
            I love this books because it combines philosophy with psychology in a story format.
            It's a dialouge between a wise old man and an inexperienced curious young person.
            It expands on the Adlerian psychology, on how there is always an internal purpose that justifies our actions(or inactions).
            It provides controversial and eye-opening views on self-worth, confidence, fear, trauma, superiority, subjectiveness of our worlds, and the meaning of community.
        `,
        author: 'Ichiro Kishimi',
        link: 'https://www.amazon.ca/Courage-Be-Disliked-Phenomenon-Happiness/dp/1501197274',
        recommendTo: 'everyone',
        rating: 10,
        date: '2021-12',
    },
    // {
    //     title: 'Essentialism',
    //     subtitle: 'A curious minimalist adventurer with exceptional prose writing ability, and radical mindset and counter-intuitive useful ideas.',
    //     author: 'Greg McKeown',
    //     link: '',
    //     recommendTo: 'everyone',
    //     rating: 10,
    //     date: '2020-06',
    // },
]
let items = books.map((b) => Templates.book(b.title, b.subtitle, b.author, b.recommendTo, b.date, b.link, b.rating))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))