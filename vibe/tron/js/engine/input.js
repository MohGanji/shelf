// Keyboard input manager
export class InputManager {
    constructor() {
        this.keys = {};
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    onKeyDown(e) {
        this.keys[e.code] = true;
        // Prevent default for game keys
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    get accelerate() {
        return this.keys['KeyW'] || this.keys['ArrowUp'] || false;
    }

    get brake() {
        return this.keys['KeyS'] || this.keys['ArrowDown'] || false;
    }

    get steerLeft() {
        return this.keys['KeyA'] || this.keys['ArrowLeft'] || false;
    }

    get steerRight() {
        return this.keys['KeyD'] || this.keys['ArrowRight'] || false;
    }

    get nitro() {
        return this.keys['Space'] || false;
    }

    get activate() {
        return this.keys['KeyE'] || false;
    }

    get pause() {
        return this.keys['Escape'] || false;
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }
}
