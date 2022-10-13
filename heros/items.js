const heros = [
    {
        title: 'Derek Sivers',
        subtitle: `
            A curious minimalist adventurer with exceptional prose writing ability.
            Hearing about his radical lifestyle and counter-intuitive useful ideas is always captivating.
            His viewpoint to life is something that the world needs more of.
        `,
        date: '2022-06',
        website: 'sive.rs'
    },
    {
        title: 'Mark Manson',
        subtitle: `
            A crazy, fearless dude with a special tone in his writings.
            Reading him, or watching his youtube videos feels as if a friend is sitting next to you and talking to you.
            He is one of the people with a lot of influence on how I think.
        `,
        date: '2022-07',
        website: 'markmanson.net'
    },
    {
        title: 'Tim Urban',
        subtitle: `
            A hyper-curious blogger.
            His blog posts contain stick figure comics for better illustration. 
            He is a genius in simplifying stuff and organizing complicated matters into a digestable blog posts.
        `,
        date: '2022-06',
        website: 'waitbutwhy.com'
    },
    {
        title: 'Seth Godin',
        subtitle: `
            Wise, intuitive, disciplined.
            His blog is one of the blogs I follow almost daily.
        `,
        date: '2022-07',
        website: 'seth.blog'
    },
    {
        title: 'Jia Jiang',
        subtitle: `
            An ordinary immigrant who overcame fear of rejection with a 100 day rejection therapy challenge. 
            His talks are inspiring because he shares his vulnerability easily.
        `,
        date: '2022-06',
        website: 'www.rejectiontherapy.com/100-days-of-rejection-therapy'
    },
    {
        title: 'Austin Kleon',
        subtitle: `
            A writer who draws.
            I love his books, writings, and the way he thinks.
            His blog is one of my favorites as I always stumble upon new fascinating books and blogs there.
        `,
        date: '2022-07',
        website: 'austinkleon.com'
    },
    // {
    //     title: 'Naval Ravikant',
    //     subtitle: `
    //         His writings are heavy, deep, and thought-provoking.
    //     `,
    //     date: '2022-07',
    //     website: 'nav.al'
    // },
    {
        title: 'Chip Wilson',
        subtitle: `
            The founder of Lululemon.
            I'm much influenced by his life principles, 
            like the one on his website: count the remaining days of your life.
        `,
        date: '2022-07',
        website: 'chipwilson.com'
    },
    {
        title: 'Jocko Willink',
        subtitle: `
            Super dedicated, super disciplined, and a little bit scary.
            I respect him for his never-ending streak of tweets of his watch at 4:30am every day.
        `,
        date: '2022-07',
        website: 'jockopodcast.com'
    },
    {
        title: 'Nathan Barry',
        subtitle: `
            His transparency is one of the rarest things I've seen on the internet.
            He writes about how he manages his company, his own financials, and his life decisions with statistics.
            I usually follow him on twitter, but some of his blog posts are super-inspiring.
        `,
        date: '2022-07',
        website: 'nathanbarry.com'
    },
]
let items = heros.map((hero) => Templates.hero(hero.title, hero.subtitle, hero.date, hero.website))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))