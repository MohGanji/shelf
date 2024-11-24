function footer() {
    const container = document.querySelector('.container'); 
    if(!container) return
    const footerDiv = document.createElement('div');
    footerDiv.className = 'footer';
    footerDiv.innerHTML = `
    <style>
        #gumroad-follow-form-embed{margin: 0px; padding: 0px; box-sizing: border-box; min-width: 0px; max-width: 100%; vertical-align: bottom; background-clip: padding-box; scrollbar-color: rgb(221 221 221/0.5) rgb(221 221 221/0.1); display: grid; grid-auto-flow: column; gap: 0.75rem; grid-template-columns: 1fr; grid-auto-columns: max-content; align-items: center;}#gumroad-follow-form-embed-button{margin: 0px; padding: 0px; box-sizing: border-box; min-width: 0px; max-width: 100%; vertical-align: bottom; background-clip: padding-box; scrollbar-color: rgb(221 221 221/0.5) rgb(221 221 221/0.1); background: transparent; font-size: 1rem; line-height: 1.5; padding: 0.75rem 1rem; border: solid .0625rem rgb(221 221 221/0.35); color: currentcolor; border-radius: 0.25rem; "Mabry Pro", Avenir, Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; text-decoration: none; transition-timing-function: ease-out; transition-duration: 0.14s; transition-property: all;background-color: rgb(221 221 221); color: rgb(0 0 0); }#gumroad-follow-form-embed-button:hover{transform: translate(-0.25rem, -0.25rem); box-shadow: .25rem .25rem 0rem rgb(221 221 221);background-color: #4baea4; color: rgb(0 0 0); }#gumroad-follow-form-embed-input{margin: 0px; padding: 0px; box-sizing: border-box; min-width: 0px; max-width: 100%; vertical-align: bottom; background-clip: padding-box; scrollbar-color: rgb(221 221 221/0.5) rgb(221 221 221/0.1); "Mabry Pro", Avenir, Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif; padding: 0.75rem 1rem; font-size: 1rem; line-height: 1.5; border: solid .0625rem rgb(221 221 221/0.35); border-radius: 0.25rem; display: block; width: 100%; background-color: rgb(0 0 0); color: rgb(221 221 221); }#gumroad-follow-form-embed-input:disabled{cursor: not-allowed; opacity: 0.3;}#gumroad-follow-form-embed-input::placeholder{color: rgb(221 221 221/0.5);}#gumroad-follow-form-embed-input:focus-within{outline: .125rem solid #4baea4;}#gumroad-follow-form-embed-input:read-only{background-color: #242423;}
    </style>
    <form class="input-with-button" action="https://app.gumroad.com/follow_from_embed_form" method="post" id="gumroad-follow-form-embed" style="margin-bottom: 1.2em;">
        <input type="hidden" name="seller_id" value="3353351560888"/>
        <input id="gumroad-follow-form-embed-input" type="email" placeholder="type your email here" name="email" value=""/>
        <button id="gumroad-follow-form-embed-button" class="primary" type="submit">then click here</button>
    </form>

    <a class="item-subtitle" href="/">Homepage</a>
    `;
    container.appendChild(footerDiv);
}

document.addEventListener('DOMContentLoaded', footer);

document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('#gumroad-follow-form-embed-button').addEventListener('click', function() {
        gtag('event', 'subscribe_button_clicked', {
            'event_category': 'subscribe_newsletter',
            'event_label': window.location.pathname,
            'page_url': window.location.href,
            'is_empty': document.querySelector('#gumroad-follow-form-embed-input').value === '' ? 'yes' : 'no'
        });
    });
});
