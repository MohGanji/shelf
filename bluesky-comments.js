/**
 * Bluesky Comments System
 * Based on the AT Protocol - fetches and displays Bluesky thread replies as blog comments
 * 
 * Usage: 
 * 1. Post your blog to Bluesky
 * 2. Copy the post URL (e.g., https://bsky.app/profile/username.bsky.social/post/abc123)
 * 3. Extract the DID and post CID from the URL or use convertBlueskyUrl()
 * 4. Add bluesky object to your post in items.js with did and postCid
 * 
 * The system will automatically render comments in the footer when available.
 */

class BlueskyComments {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            maxDepth: 5,
            apiEndpoint: 'https://public.api.bsky.app/xrpc',
            loadingText: 'Loading comments...',
            errorText: 'Failed to load comments. Please try again later.',
            noCommentsText: 'No comments yet. Join the conversation on Bluesky!',
            ...options
        };
        this.isLoading = false;
    }

    /**
     * Converts a Bluesky post URL to DID and post CID
     * @param {string} url - Bluesky post URL (e.g., https://bsky.app/profile/username.bsky.social/post/abc123)
     * @returns {Object} - {did: string, postCid: string} or null if invalid
     */
    static convertBlueskyUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            
            if (pathParts.length >= 5 && pathParts[1] === 'profile' && pathParts[3] === 'post') {
                const handle = pathParts[2];
                const postCid = pathParts[4];
                
                // For handle-based URLs, we'll need to resolve the DID
                // For now, return a structure that can be used with handle resolution
                return {
                    handle: handle,
                    postCid: postCid,
                    needsDidResolution: true
                };
            }
        } catch (e) {
            console.error('Invalid Bluesky URL:', e);
        }
        return null;
    }

    /**
     * Resolves a handle to a DID using the AT Protocol
     * @param {string} handle - Bluesky handle (e.g., username.bsky.social)
     * @returns {Promise<string>} - DID
     */
    async resolveHandleToDid(handle) {
        try {
            const response = await fetch(`${this.options.apiEndpoint}/com.atproto.identity.resolveHandle?handle=${handle}`);
            if (!response.ok) throw new Error('Failed to resolve handle');
            const data = await response.json();
            return data.did;
        } catch (error) {
            console.error('Error resolving handle to DID:', error);
            throw error;
        }
    }

    /**
     * Fetches thread data from Bluesky API
     * @param {string} did - User DID
     * @param {string} postCid - Post CID
     * @returns {Promise<Object>} - Thread data
     */
    async fetchThread(did, postCid) {
        try {
            const uri = `at://${did}/app.bsky.feed.post/${postCid}`;
            const response = await fetch(`${this.options.apiEndpoint}/app.bsky.feed.getPostThread?uri=${uri}&depth=10`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.thread;
        } catch (error) {
            console.error('Error fetching thread:', error);
            throw error;
        }
    }

    /**
     * Formats a date for display
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }

    /**
     * Renders rich text with links, mentions, hashtags
     * @param {Object} record - Post record with text and facets
     * @returns {string} - HTML string
     */
    renderRichText(record) {
        if (!record.text) return '';
        
        let text = record.text;
        let html = '';
        let lastIndex = 0;
        
        // Process facets (links, mentions, hashtags)
        if (record.facets) {
            const sortedFacets = record.facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
            
            for (const facet of sortedFacets) {
                // Add text before this facet
                html += this.escapeHtml(text.slice(lastIndex, facet.index.byteStart));
                
                // Add the facet content
                const facetText = text.slice(facet.index.byteStart, facet.index.byteEnd);
                
                if (facet.features) {
                    for (const feature of facet.features) {
                        if (feature.$type === 'app.bsky.richtext.facet#link') {
                            html += `<a href="${feature.uri}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(facetText)}</a>`;
                        } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
                            html += `<a href="https://bsky.app/profile/${feature.did}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(facetText)}</a>`;
                        } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
                            html += `<a href="https://bsky.app/hashtag/${feature.tag}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(facetText)}</a>`;
                        } else {
                            html += this.escapeHtml(facetText);
                        }
                        break; // Use first recognized feature
                    }
                } else {
                    html += this.escapeHtml(facetText);
                }
                
                lastIndex = facet.index.byteEnd;
            }
        }
        
        // Add remaining text
        html += this.escapeHtml(text.slice(lastIndex));
        
        // Convert newlines to <br>
        return html.replace(/\n/g, '<br>');
    }

    /**
     * Escapes HTML characters
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Renders embed content (images, external links, quotes)
     * @param {Object} embed - Embed object
     * @returns {string} - HTML string
     */
    renderEmbed(embed, blueskyUrl) {
        if (!embed) return '';
        
        if (embed.$type === 'app.bsky.embed.images#view') {
            return this.renderImageEmbed(embed, blueskyUrl);
        } else if (embed.$type === 'app.bsky.embed.external#view') {
            return this.renderExternalEmbed(embed);
        } else if (embed.$type === 'app.bsky.embed.record#view') {
            return this.renderQuoteEmbed(embed);
        } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
            // Handle combined record + media embeds
            let html = '';
            if (embed.record) html += this.renderEmbed(embed.record, blueskyUrl);
            if (embed.media) html += this.renderEmbed(embed.media, blueskyUrl);
            return html;
        }
        
        return `<div class="bsky-embed-unsupported">Unsupported embed type: ${embed.$type}</div>`;
    }

    /**
     * Renders image embed
     * @param {Object} embed - Image embed
     * @param {string} blueskyUrl - The URL of the Bluesky post
     * @returns {string} - HTML string
     */
    renderImageEmbed(embed, blueskyUrl) {
        if (!embed.images || embed.images.length === 0) return '';

        let images = '';
        const imageCount = embed.images.length;
        const displayImages = imageCount > 4 ? embed.images.slice(0, 3) : embed.images;

        images = displayImages.map(img => {
            const alt = img.alt || 'Image';
            return `
                <div class="bsky-image-container">
                    <img src="${img.thumb}" alt="${this.escapeHtml(alt)}" 
                         class="bsky-embed-image" loading="lazy"
                         onclick="window.open('${img.fullsize}', '_blank')">
                </div>
            `;
        }).join('');

        if (imageCount > 4) {
            images += `
                <a href="${blueskyUrl}" target="_blank" rel="noopener noreferrer" class="bsky-image-container bsky-more-images">
                    +${imageCount - 3}
                </a>
            `;
        }
        
        const gridClass = imageCount === 1 ? 'bsky-images-single' : 
                         imageCount === 2 ? 'bsky-images-two' :
                         imageCount === 3 ? 'bsky-images-three' : 'bsky-images-four';
        
        return `<div class="bsky-images ${gridClass}">${images}</div>`;
    }

    /**
     * Renders external link embed
     * @param {Object} embed - External embed
     * @returns {string} - HTML string
     */
    renderExternalEmbed(embed) {
        const external = embed.external;
        if (!external) return '';
        
        const title = external.title || external.uri;
        const description = external.description || '';
        const thumb = external.thumb || '';
        
        return `
            <a href="${external.uri}" target="_blank" rel="noopener noreferrer" class="bsky-external-link">
                <div class="bsky-external-content">
                    ${thumb ? `<img src="${thumb}" alt="" class="bsky-external-thumb">` : ''}
                    <div class="bsky-external-text">
                        <div class="bsky-external-title">${this.escapeHtml(title)}</div>
                        ${description ? `<div class="bsky-external-description">${this.escapeHtml(description)}</div>` : ''}
                        <div class="bsky-external-uri">${this.escapeHtml(external.uri)}</div>
                    </div>
                </div>
            </a>
        `;
    }

    /**
     * Renders quote embed
     * @param {Object} embed - Quote embed
     * @returns {string} - HTML string
     */
    renderQuoteEmbed(embed) {
        const record = embed.record;
        if (!record || !record.value) return '';
        
        const author = record.author;
        const authorName = author.displayName || author.handle;
        const content = this.renderRichText(record.value);
        const date = this.formatDate(record.value.createdAt);
        
        return `
            <div class="bsky-quote">
                <div class="bsky-quote-author">
                    ${author.avatar ? `<img src="${author.avatar}" alt="" class="bsky-quote-avatar">` : ''}
                    <span class="bsky-quote-name">${this.escapeHtml(authorName)}</span>
                    <span class="bsky-quote-handle">@${this.escapeHtml(author.handle)}</span>
                    <span class="bsky-quote-date">${date}</span>
                </div>
                <div class="bsky-quote-content">${content}</div>
            </div>
        `;
    }

    /**
     * Renders a single reply
     * @param {Object} thread - Thread object
     * @param {number} depth - Current nesting depth
     * @returns {string} - HTML string
     */
    renderReply(thread, depth = 0) {
        if (!thread.post || depth > this.options.maxDepth) return '';
        
        const post = thread.post;
        const author = post.author;
        const record = post.record;
        
        const authorName = author.displayName || author.handle;
        const content = this.renderRichText(record);
        const embed = this.renderEmbed(post.embed, `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`);
        const date = this.formatDate(record.createdAt);
        const avatarUrl = author.avatar || '';
        
        const replyCount = thread.replies ? thread.replies.length : 0;
        const likeCount = post.likeCount || 0;
        const repostCount = post.repostCount || 0;
        
        // Generate unique ID for this comment
        const commentId = `comment-${post.uri.split('/').pop()}`;
        
        // Generate AT URI for direct link
        const atUri = `at://${author.did}/app.bsky.feed.post/${post.uri.split('/').pop()}`;
        const blueskyUrl = `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`;
        
        // Determine if this comment has replies and should be expandable
        const hasReplies = thread.replies && thread.replies.length > 0 && depth < this.options.maxDepth;
        const expandableClass = hasReplies ? 'bsky-reply-expandable' : '';
        const expandButton = hasReplies ? `<button class="bsky-expand-btn" onclick="toggleCommentThread('${commentId}')" aria-label="Expand replies">
            <span class="bsky-expand-icon">▶</span> ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}
        </button>` : '';
        
        let html = `
            <div class="bsky-reply ${expandableClass}" style="margin-left: ${depth * 20}px;" data-depth="${depth}" id="${commentId}">
                <div class="bsky-reply-header">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="" class="bsky-reply-avatar">` : ''}
                    <div class="bsky-reply-author">
                        <span class="bsky-reply-name">${this.escapeHtml(authorName)}</span>
                        <span class="bsky-reply-handle">@${this.escapeHtml(author.handle)}</span>
                    </div>
                    <div class="bsky-reply-meta">
                        <span class="bsky-reply-date">${date}</span>
                        <a href="${blueskyUrl}" target="_blank" rel="noopener noreferrer" class="bsky-reply-link">View on Bluesky</a>
                    </div>
                </div>
                <div class="bsky-reply-content">${content}</div>
                ${embed ? `<div class="bsky-reply-embed">${embed}</div>` : ''}
                <div class="bsky-reply-stats">
                    ${likeCount > 0 ? `<span class="bsky-stat">❤️ ${likeCount}</span>` : ''}
                    ${repostCount > 0 ? `<span class="bsky-stat">🔄 ${repostCount}</span>` : ''}
                    ${expandButton}
                </div>
        `;
        
        // Render nested replies (initially hidden if this is a top-level comment)
        if (hasReplies) {
            const repliesHidden = depth === 0 ? 'style="display: none;"' : '';
            html += `<div class="bsky-replies-nested" id="${commentId}-replies" ${repliesHidden}>`;
            for (const reply of thread.replies) {
                html += this.renderReply(reply, depth + 1);
            }
            html += '</div>';
        }
        
        html += '</div>';
        
        return html;
    }

    /**
     * Renders the main post header
     * @param {Object} thread - Main thread object
     * @param {string} blueskyUrl - Original Bluesky post URL
     * @returns {string} - HTML string
     */
    renderMainPost(thread, blueskyUrl) {
        if (!thread.post) return '';
        
        const post = thread.post;
        const author = post.author;
        const record = post.record;
        
        const authorName = author.displayName || author.handle;
        const date = this.formatDate(record.createdAt);
        const replyCount = thread.replies ? thread.replies.length : 0;
        
        return `
            <div class="bsky-main-post">
                <div class="bsky-main-post-header">
                    <h3>Comments</h3>
                    <div class="bsky-main-post-meta">
                        <span>${replyCount} ${replyCount === 1 ? 'comment' : 'comments'}</span>
                        <a href="${blueskyUrl}" target="_blank" rel="noopener noreferrer" class="bsky-join-conversation">Join the conversation on Bluesky</a>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renders loading state
     * @returns {string} - HTML string
     */
    renderLoading() {
        return `<div class="bsky-loading">${this.options.loadingText}</div>`;
    }

    /**
     * Renders error state
     * @param {string} message - Error message
     * @returns {string} - HTML string
     */
    renderError(message) {
        return `<div class="bsky-error">${message || this.options.errorText}</div>`;
    }

    /**
     * Renders empty state
     * @param {string} blueskyUrl - Bluesky post URL for joining conversation
     * @returns {string} - HTML string
     */
    renderEmpty(blueskyUrl) {
        return `
            <div class="bsky-empty">
                <p>${this.options.noCommentsText}</p>
                <a href="${blueskyUrl}" target="_blank" rel="noopener noreferrer" class="bsky-join-conversation">
                    Join the conversation on Bluesky
                </a>
            </div>
        `;
    }

    /**
     * Main render function
     * @param {string} did - User DID
     * @param {string} postCid - Post CID  
     * @param {string} blueskyUrl - Original Bluesky post URL (optional, for display)
     */
    async render(did, postCid, blueskyUrl = null) {
        if (!this.container || this.isLoading) return;
        
        this.isLoading = true;
        this.container.innerHTML = this.renderLoading();
        
        try {
            const thread = await this.fetchThread(did, postCid);
            
            if (!thread || !thread.post) {
                this.container.innerHTML = this.renderError('Post not found');
                return;
            }
            
            // Generate Bluesky URL if not provided
            if (!blueskyUrl) {
                const handle = thread.post.author.handle;
                blueskyUrl = `https://bsky.app/profile/${handle}/post/${postCid}`;
            }
            
            let html = this.renderMainPost(thread, blueskyUrl);
            
            if (!thread.replies || thread.replies.length === 0) {
                html += this.renderEmpty(blueskyUrl);
            } else {
                html += '<div class="bsky-replies">';
                for (const reply of thread.replies) {
                    html += this.renderReply(reply, 0);
                }
                html += '</div>';
            }
            
            this.container.innerHTML = html;
            
        } catch (error) {
            console.error('Error rendering Bluesky comments:', error);
            this.container.innerHTML = this.renderError();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renders comments from a Bluesky URL (convenience method)
     * @param {string} blueskyUrl - Full Bluesky post URL
     */
    async renderFromUrl(blueskyUrl) {
        const urlData = BlueskyComments.convertBlueskyUrl(blueskyUrl);
        if (!urlData) {
            this.container.innerHTML = this.renderError('Invalid Bluesky URL');
            return;
        }
        
        try {
            if (urlData.needsDidResolution) {
                const did = await this.resolveHandleToDid(urlData.handle);
                await this.render(did, urlData.postCid, blueskyUrl);
            } else {
                await this.render(urlData.did, urlData.postCid, blueskyUrl);
            }
        } catch (error) {
            console.error('Error rendering from URL:', error);
            this.container.innerHTML = this.renderError();
        }
    }
}

// Global function to toggle comment threads
function toggleCommentThread(commentId) {
    const repliesDiv = document.getElementById(`${commentId}-replies`);
    const expandIcon = document.querySelector(`#${commentId} .bsky-expand-icon`);
    
    if (!repliesDiv || !expandIcon) return;
    
    const isHidden = repliesDiv.style.display === 'none';
    
    if (isHidden) {
        repliesDiv.style.display = 'block';
        expandIcon.textContent = '▼';
        expandIcon.parentElement.setAttribute('aria-label', 'Collapse replies');
    } else {
        repliesDiv.style.display = 'none';
        expandIcon.textContent = '▶';
        expandIcon.parentElement.setAttribute('aria-label', 'Expand replies');
    }
}

// Make function globally available
if (typeof window !== 'undefined') {
    window.toggleCommentThread = toggleCommentThread;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlueskyComments;
}
