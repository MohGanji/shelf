class Util {
    /**
     * formats a name so that it is compatible with filenames.
     * @param {string} name 
     */
    static fmt(name) {
        return name.toLowerCase().replaceAll(' ', '-')
    }

    /**
     * gets a string in html format and returns it as an html element.
     * @param {string} str
     */
    static strToHtml(str) {
        return (new DOMParser()).parseFromString(str, 'text/html').body.childNodes[0]
    }
}

const Templates  = {
    hero: (title, subtitle, date, website) => {
        let templateString = `
<div class="item clickable" onclick="window.location.href = './${Util.fmt(title)}.html'">
    <div class="col img-container">
        <img class="item-image" src="/assets/heros/${Util.fmt(title)}.jpg" width="100%" height="auto" />
    </div>
    <div class="col other-container">
        <div class="item-part item-title">${title}</div>
        <div class="item-part item-subtitle">${subtitle}</div>
        <a   class="item-part item-link" href="http://${website}">${website}</a>
        <div class="item-part item-date">Written on: ${date}</div>
    </div>
</div>
`;
        return Util.strToHtml(templateString);
    },
    book: (title, subtitle, author, recommendTo, date, link, rating) => {
        let templateString = `
<div class="item clickable" onclick="window.location.href = './${Util.fmt(title)}.html'">
    <div class="col img-container">
        <img class="item-image" src="/assets/books/${Util.fmt(title)}.jpg" width="100%" height="auto" />
        <div class=""><b>${rating}</b>/10</div>
    </div>
    <div class="col other-container">
        <div class="item-part item-title">${title} - by ${author}</div>
        <div class="item-part item-subtitle">${subtitle}</div>
        <div class="item-part item-date"><b>Who I would recommend to:</b> ${recommendTo}</div>
        <div class="item-part item-date">Date read: ${date}</div>
        <a   class="item-part item-link" href="http://${link}">Amazon page</a>
    </div>
</div>
`;
        return Util.strToHtml(templateString);
    }
}