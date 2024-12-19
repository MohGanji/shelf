class AudioPlayer {
    constructor(container, audioSrc) {
        this.container = container;
        this.audio = container.querySelector('audio');
        this.audio.src = audioSrc;
        this.playPauseBtn = container.querySelector('#playPauseBtn');
        this.progressBar = container.querySelector('#progressBar');
        this.progress = container.querySelector('#progress');
        this.currentTimeEl = container.querySelector('#currentTime');
        this.durationEl = container.querySelector('#duration');
        this.speedBtn = container.querySelector('#speedBtn');

        this.playIcon = this.playPauseBtn.querySelector('.play-icon');
        this.pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

        this.bindEvents();
        this.audio.addEventListener('loadedmetadata', () => this.setTotalTime());
    }

    bindEvents() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.progressBar.addEventListener('click', (e) => this.setProgress(e));
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.audioEnded());
        this.speedBtn.addEventListener('click', () => this.changeSpeed());
    }

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
            this.playIcon.style.display = 'none';
            this.pauseIcon.style.display = 'block';
            this.playPauseBtn.setAttribute('aria-label', 'Pause');
        } else {
            this.audio.pause();
            this.playIcon.style.display = 'block';
            this.pauseIcon.style.display = 'none';
            this.playPauseBtn.setAttribute('aria-label', 'Play');
        }
    }

    setProgress(e) {
        const width = this.progressBar.clientWidth;
        const clickX = e.offsetX;
        const duration = this.audio.duration;
        this.audio.currentTime = (clickX / width) * duration;
    }

    updateProgress() {
        const duration = this.audio.duration;
        const currentTime = this.audio.currentTime;
        const progressPercent = (currentTime / duration) * 100;
        this.progress.style.width = `${progressPercent}%`;
        this.currentTimeEl.textContent = this.formatTime(currentTime);
    }

    setTotalTime() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
    }

    audioEnded() {
        this.playIcon.style.display = 'block';
        this.pauseIcon.style.display = 'none';
        this.playPauseBtn.setAttribute('aria-label', 'Play');
        this.progress.style.width = '0%';
        this.audio.currentTime = 0;
    }

    formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    changeSpeed() {
        const speeds = [1, 1.25, 1.5, 1.75, 2];
        const currentSpeed = this.audio.playbackRate;
        const currentIndex = speeds.indexOf(currentSpeed);
        const nextIndex = (currentIndex + 1) % speeds.length;
        const newSpeed = speeds[nextIndex];
        
        this.audio.playbackRate = newSpeed;
        this.speedBtn.textContent = `${newSpeed}x`;
    }
}

// Initialize the audio player
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.audio-player');
    const audioSrc = container.getAttribute('data-src');
    new AudioPlayer(container, audioSrc);
});

