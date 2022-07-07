const heros = [
    {
        title: 'Derek Sivers',
        subtitle: 'A curious minimalist adventurer with exceptional prose writing ability, and radical mindset and counter-intuitive useful ideas.',
        date: '2022-06-05',
        website: 'sive.rs'
    },
    {
        title: 'Tim Urban',
        subtitle: 'A curious blogger. His blog posts contain stick figure comics for better illustration.',
        date: '2022-06-05',
        website: 'waitbutwhy.com'
    },
    {
        title: 'Jia Jiang',
        subtitle: 'An ordinary immigrant who overcame fear of rejection with a 100 day rejection therapy challenge. His talks are inspiring because he shares his vulnerability easily.',
        date: '2022-06-07',
        website: 'rejectiontherapy.com'
    }
]
let items = heros.map((hero) => Templates.hero(hero.title, hero.subtitle, hero.date, hero.website))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))