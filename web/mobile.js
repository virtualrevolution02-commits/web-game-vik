// Mobile Controller Logic

document.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const hostPeerId = urlParams.get('p');

    const overlay = document.getElementById('overlay');
    const overlayMessage = document.getElementById('overlay-message');
    const overlaySpinner = document.getElementById('overlay-spinner');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (!hostPeerId) {
        showError("Invalid Session", "Please scan the QR code from the game again.");
        return;
    }

    // --- Controller State ---
    const state = {
        steer: 0, // -1 (left) to 1 (right)
        gear: 0   // 0 (Park), 1, 2, or 3
    };

    // --- PeerJS Setup ---
    const peer = new Peer({ debug: 2 });
    let conn = null;

    peer.on('open', (id) => {
        console.log('Mobile peer open with ID: ' + id);
        connectToHost();
    });

    peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        showError("Connection Error", err.type || err.message);
    });

    function connectToHost() {
        console.log('Connecting to host: ' + hostPeerId);
        conn = peer.connect(hostPeerId, {
            reliable: false // faster for game data
        });

        conn.on('open', () => {
            console.log('Connected to host!');

            // Visual feedback
            hideOverlay();
            statusText.textContent = "Connected";
            statusDot.classList.add('connected');

            // Start sending data regularly
            setInterval(sendInputData, 1000 / 30); // 30Hz update rate
        });

        conn.on('close', () => {
            console.log('Connection closed by host');
            showError("Disconnected", "Game closed or connection lost.");
            statusText.textContent = "Disconnected";
            statusDot.classList.remove('connected');
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            showError("Connection Error", "Lost connection to the game.");
        });
    }

    function sendInputData() {
        if (conn && conn.open) {
            conn.send({
                type: 'control',
                steer: state.steer,
                gear: state.gear
            });
        }
    }

    function showError(title, message) {
        overlay.classList.remove('overlay-hidden');
        overlaySpinner.style.display = 'none';
        overlayMessage.textContent = title;
        document.getElementById('overlay-submessage').textContent = message;
    }

    function hideOverlay() {
        overlay.classList.add('overlay-hidden');
    }

    // --- Joystick (nipplejs) Setup ---
    const joystickZone = document.getElementById('joystick-zone');
    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        position: { left: '50%', top: '50%' },
        color: '#10B981',
        size: 140,
        lockY: true // Restrict to horizontal movement mostly, or we can just ignore Y
    });

    manager.on('move', (evt, data) => {
        // x goes from -1 (left) to 1 (right) roughly based on distance and angle
        if (data.direction) {
            // max distance is size/2 = 70.
            const rawX = Math.cos(data.angle.radian) * data.distance;
            // normalize to -1.0 to 1.0
            let normX = rawX / 70.0;
            normX = Math.max(-1.0, Math.min(1.0, normX));

            state.steer = normX;
        }
    });

    manager.on('end', () => {
        state.steer = 0;
    });

    // --- Gear Shifter Setup ---
    const track = document.getElementById('gear-slider-track');
    const knob = document.getElementById('gear-knob');
    let isDraggingGear = false;
    let trackRect = null;

    // touch/mouse events for gear
    track.addEventListener('mousedown', startGearDrag);
    track.addEventListener('touchstart', (e) => startGearDrag(e.touches[0]), { passive: false });

    window.addEventListener('mousemove', dragGear);
    window.addEventListener('touchmove', (e) => {
        if (isDraggingGear) e.preventDefault(); // prevent scrolling
        dragGear(e.touches[0]);
    }, { passive: false });

    window.addEventListener('mouseup', endGearDrag);
    window.addEventListener('touchend', endGearDrag);

    function setGear(gearLevel) {
        state.gear = gearLevel;
        knob.textContent = gearLevel === 0 ? 'P' : gearLevel;

        // Update visual position (0% = Gear P, 33% = Gear 1, 66% = Gear 2, 100% = Gear 3)
        // Note: 'bottom' percentage.
        if (gearLevel === 0) knob.style.bottom = "0%";
        else if (gearLevel === 1) knob.style.bottom = "33%";
        else if (gearLevel === 2) knob.style.bottom = "66%";
        else if (gearLevel === 3) knob.style.bottom = "100%";

        // Haptic feedback if supported
        if (navigator.vibrate) {
            navigator.vibrate(20); // short buzz
        }
    }

    function startGearDrag(e) {
        isDraggingGear = true;
        trackRect = track.getBoundingClientRect();
        knob.classList.add('active');
        dragGear(e);
    }

    function dragGear(e) {
        if (!isDraggingGear || !e) return;

        // Calculate Y position relative to track
        const y = e.clientY - trackRect.top;
        const height = trackRect.height;

        // Invert Y so 0 is bottom, 1 is top
        let ratio = 1 - (y / height);
        ratio = Math.max(0, Math.min(1, ratio));

        // Snap to nearest gear zone (P: 0-0.25, 1: 0.25-0.5, 2: 0.5-0.75, 3: 0.75-1.0)
        let newGear = 0;
        if (ratio > 0.8) newGear = 3;
        else if (ratio > 0.5) newGear = 2;
        else if (ratio > 0.2) newGear = 1;

        if (newGear !== state.gear) {
            setGear(newGear);
        }
    }

    function endGearDrag() {
        if (isDraggingGear) {
            isDraggingGear = false;
            knob.classList.remove('active');
            // snap visually to the strict gear position
            setGear(state.gear);
        }
    }

});
