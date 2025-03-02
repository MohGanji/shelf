/**
 * @typedef {Object} Project
 * @property {string} title - The title of the project
 * @property {string} description - Description of the project
 * @property {string} link - URL link to the project
 * @property {string} image - image URL for the project
 * @property {string} [techStack] - Optional comma separated technologies used in the project
 * @property {string} [icon] - Optional icon SVG code for the project link
 */

/** @type {Project[]} */
const projects = [
    {
        title: "ganji.me",
        description: "This website. My personal blog and portfolio, built from scratch using only vanilla HTML, CSS, and JavaScript for responsiveness and fun. It used to look like the shelf in the image once but now it's much more minimalistic.",
        // techStack: "HTML, CSS, JavaScript",
        link: "https://ganji.me",
        image: "./assets/shelf-screenshot.png",
    },
    {
        title: "SchemaIran Bot",
        description: "I developed a Telegram bot for Schemairan clinic to conduct YSQ tests (Yonge Schema Questionnaire) online. We analyzed 10k+ test results over 4 years and conducted a quantitative analysis, published as a research paper.",
        // techStack: "Python, Node.js, MongoDB, Telegram API",
        link: "https://t.me/SchemaIran_Bot",
        image: "./assets/schemairan.png",
    },
    {
        title: "JScope",
        description: "JScope is a VSCode extension that enables measuring and visualizing async code coverage criteria. I built it as part of my research \"code coverage criteria for asyncrhonous programs (ESEC/FSE 2023)\" during my master's at SFU",
        // techStack: "Typescript, VSCode API",
        link: "https://github.com/MohGanji/jscope",
        image: "./assets/jscope.png",
    },
    {
        title: "BlogFrog.xyz",
        description: "Blogfrog is a blog post dispencer that takes user to a random blog post from my favorite writers. I created it to replace my doomscrolling on twitter and instagram with reading blogs.",
        // techStack: "Html, CSS, JavaScript",
        link: "http://blogfrog.xyz",
        image: "./assets/blogfrog.png",
    },
];

const DEFAULT_ICON = `<svg 
                role="img" 
                viewBox="0 0 24 24" 
                width="1.2rem" height="auto"
                xmlns="http://www.w3.org/2000/svg"
            >
                <title>External Link</title>
                <path fill="var(--url-color)" d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"/>
            </svg>`;

/**
 * Creates HTML markup for a project card
 * @param {Project} project - The project object containing title, description, link etc.
 * @returns {string} HTML string for the project card
 */
const createProjectCard = (project) => {
    return `
        <div class="portfolio-item">
            <div class="content-media">
                <img src="${project.image}" alt="">
                <div class="hover-description">
                    <p>${project.description}</p>
                    ${project.techStack ? `<p style="font-style: italic">${project.techStack}</p>` : ""}
                </div>
            </div>
            <a class="content-link" href="${project.link}">
                <span class="link-text">${project.title}</span>
                ${project.icon || DEFAULT_ICON}
            </a>
        </div>
    `;
};

// Wait for DOM to be loaded
document.addEventListener('DOMContentLoaded', () => {
    // Find portfolio items container
    const portfolioContainer = document.querySelector('.portfolio-items');

    if (!portfolioContainer) {
        console.error('Could not find portfolio items container');
        return;
    }

    // Generate HTML for each project
    const projectCardsHTML = projects.map(project => createProjectCard(project)).join('\n');

    // Append the project cards HTML to the existing content
    portfolioContainer.insertAdjacentHTML('beforeend', projectCardsHTML);
});

