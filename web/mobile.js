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
        gear: 0,   // 0 (Park), 1, 2, or 3
        motionEnabled: false
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

    // --- Steering Buttons Setup ---
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    function handleSteer(val, btn) {
        state.steer = val;
        btn.classList.add('active-touch');
        if (navigator.vibrate) navigator.vibrate(15);
    }

    function resetSteer(btn) {
        state.steer = 0;
        btn.classList.remove('active-touch');
    }

    // Left Button
    btnLeft.addEventListener('mousedown', () => { if (!state.motionEnabled) handleSteer(-1, btnLeft) });
    btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.motionEnabled) handleSteer(-1, btnLeft) }, { passive: false });
    btnLeft.addEventListener('mouseup', () => { if (!state.motionEnabled) resetSteer(btnLeft) });
    btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); if (!state.motionEnabled) resetSteer(btnLeft) }, { passive: false });
    btnLeft.addEventListener('mouseleave', () => { if (!state.motionEnabled) resetSteer(btnLeft) });

    // Right Button
    btnRight.addEventListener('mousedown', () => { if (!state.motionEnabled) handleSteer(1, btnRight) });
    btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.motionEnabled) handleSteer(1, btnRight) }, { passive: false });
    btnRight.addEventListener('mouseup', () => { if (!state.motionEnabled) resetSteer(btnRight) });
    btnRight.addEventListener('touchend', (e) => { e.preventDefault(); if (!state.motionEnabled) resetSteer(btnRight) }, { passive: false });
    btnRight.addEventListener('mouseleave', () => { if (!state.motionEnabled) resetSteer(btnRight) });

    // --- MediaPipe Hand Tracking Setup ---
    const motionBtn = document.getElementById('motion-toggle-btn');
    const cameraPreview = document.getElementById('camera-preview');
    const videoElement = document.querySelector('.input-video');
    const canvasElement = document.querySelector('.output-canvas');
    const canvasCtx = canvasElement.getContext('2d');

    let camera = null;
    let hands = null;

    motionBtn.addEventListener('click', toggleMotionControl);

    function toggleMotionControl() {
        state.motionEnabled = !state.motionEnabled;

        if (state.motionEnabled) {
            motionBtn.classList.add('active');
            cameraPreview.style.display = 'block';
            motionBtn.textContent = 'Camera ON 🟢';
            initMediaPipe();

            // Visual feedback on buttons
            btnLeft.style.opacity = '0.3';
            btnRight.style.opacity = '0.3';
            state.steer = 0; // reset manual steer
        } else {
            motionBtn.classList.remove('active');
            cameraPreview.style.display = 'none';
            motionBtn.textContent = 'Camera 📷';

            if (camera) {
                camera.stop();
            }

            // Restore buttons
            btnLeft.style.opacity = '1';
            btnRight.style.opacity = '1';
            state.steer = 0;
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
    }

    function initMediaPipe() {
        if (hands) {
            camera.start();
            return; // Already initialized
        }

        hands = new window.Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        hands.onResults(onHandResults);

        camera = new window.Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 320,
            height: 240,
            facingMode: 'user' // Front camera typically preferred for driving
        });

        camera.start();
    }

    function onHandResults(results) {
        if (!state.motionEnabled) return;

        // Draw preview
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        // Calculate steering based on exact same logic as desktop
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

            // Draw landmarks for visual feedback
            for (const landmarks of results.multiHandLandmarks) {
                for (const point of landmarks) {
                    canvasCtx.beginPath();
                    canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 2, 0, 2 * Math.PI);
                    canvasCtx.fillStyle = '#10B981';
                    canvasCtx.fill();
                }
            }

            if (results.multiHandLandmarks.length >= 2) {
                // Two Hands Logic - steering wheel angle simulation
                const hand1 = results.multiHandLandmarks[0][9];
                const hand2 = results.multiHandLandmarks[1][9];

                // Sort left to right
                const sortedHands = hand1.x < hand2.x ? [hand1, hand2] : [hand2, hand1];
                const leftHand = sortedHands[0];
                const rightHand = sortedHands[1];

                const dx = rightHand.x - leftHand.x;
                const dy = rightHand.y - leftHand.y;

                // raw angle mapping, normalized similarly to the desktop logic.
                // dy > 0 means right hand is lower than left (steering right)
                // Normalize it directly to -1 to 1 for state.steer
                const steerValueRaw = (dy / Math.max(dx, 0.1));
                state.steer = Math.max(-1, Math.min(1, steerValueRaw));

            } else {
                // One Hand Logic - horizontal position mapping
                const landmarks = results.multiHandLandmarks[0];
                const x = landmarks[9].x; // X coordinate of middle finger base (0.0 to 1.0)

                // 0.5 is center. > 0.5 is right, < 0.5 is left.
                // scale x2 so going 25% off center produces full steering.
                state.steer = Math.max(-1, Math.min(1, (x - 0.5) * 2.0));
            }
        } else {
            // No hands detected, return to center
            state.steer = 0;
        }
        canvasCtx.restore();
    }

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
