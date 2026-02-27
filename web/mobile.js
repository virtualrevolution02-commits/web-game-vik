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

    // --- Steer Slider Setup ---
    const steerSlider = document.getElementById('steer-slider');

    function updateSliderBackground(val) {
        // val is -1 to 1. Map -1 to 0%, 1 to 100%
        const percent = ((parseFloat(val) + 1) / 2) * 100;
        // The teal fill grows from the left side up to the thumb
        steerSlider.style.background = `linear-gradient(to right, #5eead4 0%, #5eead4 ${percent}%, #1d2128 ${percent}%, #1d2128 100%)`;
    }

    // Initialize background
    updateSliderBackground(0);

    steerSlider.addEventListener('input', (e) => {
        if (state.motionEnabled) {
            e.preventDefault();
            return;
        }
        state.steer = parseFloat(e.target.value);
        updateSliderBackground(state.steer);
    });

    function resetSlider() {
        if (!state.motionEnabled) {
            state.steer = 0;
            steerSlider.value = 0;
            updateSliderBackground(0);
        }
    }

    steerSlider.addEventListener('touchend', resetSlider);
    steerSlider.addEventListener('mouseup', resetSlider);
    steerSlider.addEventListener('mouseleave', resetSlider);

    // --- MediaPipe Hand Tracking Setup ---
    const cameraPreview = document.getElementById('camera-preview');
    const videoElement = document.querySelector('.input-video');
    const canvasElement = document.querySelector('.output-canvas');
    const canvasCtx = canvasElement.getContext('2d');

    let camera = null;
    let hands = null;

    function toggleMotionMode(enable) {
        state.motionEnabled = enable;

        if (state.motionEnabled) {
            tabMotion.classList.add('active');
            tabSlider.classList.remove('active');
            cameraPreview.style.display = 'block';
            initMediaPipe();

            // Visual feedback on slider
            steerSlider.style.opacity = '0.4';
            steerSlider.style.pointerEvents = 'none'; // let the camera drive it

            if (navigator.vibrate) navigator.vibrate(20);
        } else {
            tabSlider.classList.add('active');
            tabMotion.classList.remove('active');
            cameraPreview.style.display = 'none';

            if (camera) {
                camera.stop();
            }

            // Restore slider
            steerSlider.style.opacity = '1';
            steerSlider.style.pointerEvents = 'auto';
            resetSlider();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            if (navigator.vibrate) navigator.vibrate(20);
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

                // raw angle mapping, exactly matched to desktop logic
                // dy > 0 means right hand is lower than left (steering right)
                const steerValueRaw = (dy / Math.max(dx, 0.1)) * 15.0;
                state.steer = Math.max(-1, Math.min(1, steerValueRaw));

            } else {
                // One Hand Logic - horizontal position mapping
                const landmarks = results.multiHandLandmarks[0];
                const x = landmarks[9].x; // X coordinate of middle finger base (0.0 to 1.0)

                // exactly matched to desktop logic
                state.steer = Math.max(-1, Math.min(1, (x - 0.5) * 15.0));
            }
        } else {
            // No hands detected, return to center
            state.steer = 0;
        }
        canvasCtx.restore();

        // Update the visual slider to reflect motion steering!
        steerSlider.value = state.steer;
        updateSliderBackground(state.steer);
    }

    // --- Mode Toggle Setup ---
    const tabSlider = document.getElementById('tab-slider');
    const tabMotion = document.getElementById('tab-motion');

    tabMotion.addEventListener('click', () => {
        if (!state.motionEnabled) toggleMotionMode(true);
    });
    tabSlider.addEventListener('click', () => {
        if (state.motionEnabled) toggleMotionMode(false);
    });

    // --- Gear Buttons Setup ---
    const gearBtns = document.querySelectorAll('.gear-btn');

    function setGear(gearLevel) {
        state.gear = gearLevel;

        gearBtns.forEach(btn => btn.classList.remove('active'));

        // Find the button with matching data-gear value
        const activeBtn = document.querySelector(`.gear-btn[data-gear="${gearLevel}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Haptic feedback if supported
        if (navigator.vibrate) {
            navigator.vibrate(20); // short buzz
        }
    }

    // Initialize gear to 'P' (0)
    setGear(0);

    gearBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            let gearVal = btn.getAttribute('data-gear');
            setGear(parseInt(gearVal));
        });
    });

});
