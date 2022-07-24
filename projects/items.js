const projects = [
    {
        title: 'Ecotine',
        subtitle: `
            I was working, after a half hour or so, I unconciously opened a new tab, typed in: "twitter.com".
            Next thing I know is I'm scrolling down my twitter feed for an hour.
            This is me every day. 
            <br>
            There's also another side of me, that likes to read blogs.
            There are a lot of interesting people on the internet writing cool stuff in their blogs.
            I learn a lot reading those and getting to know those people.
            But I never seem to find the time to read these blogs constantly, and deciding which blog to open? Don't even open that door.
            <br>
            So I built Ecotine.
            It's a simple website with one button, that's all.
            So now every time I get tired of work, or I want to lose focus, I open ecotine.
            I let the button take me somewhere random on the internet. I read one blog post, learn something, and I get back to work. 
            Because there is no infinite scrolling feed after that.            
        `,
        link: 'ecotine.ganji.blog',
        date: '2022-07',
    },
]
let items = projects.map((p) => Templates.project(p.title, p.subtitle, p.date, p.link))
let containerElement = document.getElementById('items-container')
items.forEach(item => containerElement.appendChild(item))