// ═══════════════════════════════════════════════════════════════════════════
// ISOMETRIC DRIFT — Three.js Game Engine v2
// Porsche 911 · Infinite World · Procedural Objects · Headlights · Smoke
// ═══════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ─── CONFIG ────────────────────────────────────────────────────────────────
    const CFG = {
        BG_COLOR: 0x3B76F6,
        BODY_COLOR: 0xFFFFFF,
        GLASS_COLOR: 0x5B9AFF,
        TIRE_COLOR: 0x222222,
        GROUND_COLOR: 0x3B76F6,
        GROUND_GRID: 0x4A88FF,

        CAM_OFFSET: new THREE.Vector3(-22, 22, -22),
        CAM_SMOOTH: 0.04,

        TOP_SPEED: 36, // ui shows * 5, so 36 * 5 = 180 top speed
        ACCEL: 45,
        BRAKE: 55,
        DRAG: 0.975,
        STEER_SPEED: 3.5,
        STEER_SPEED_HIGH: 1.4,
        ANGULAR_DAMP: 0.90,
        HANDBRAKE_GRIP: 0.15,

        GRIP_NORMAL: 0.88,
        GRIP_DRIFT: 0.30,
        DRIFT_THRESHOLD: 0.40,

        PARTICLE_COUNT: 500,
        PARTICLE_SPAWN_RATE: 4,

        FIXED_DT: 1 / 60,

        // World gen
        SPAWN_RADIUS: 55,
        DESPAWN_RADIUS: 70,
        OBJECT_DENSITY: 0.55,
        CELL_SIZE: 12,

        // Road
        ROAD_WIDTH: 8,
        ROAD_SEG_LEN: 30,
        ROAD_AHEAD: 10,
        ROAD_COLOR: 0x555555,

    };

    // ─── STATE ─────────────────────────────────────────────────────────────────
    let scene, camera, renderer, clock;
    let carGroup, headlightL, headlightR, headlightGlowL, headlightGlowR;
    let wheels = [];
    let groundMesh, gridMesh;
    let particlePool;
    let audioCtx, engineOsc, engineGain, driftNoiseNode, driftGain;

    // Day/Night Cycle
    let dayNightRatio = 0.0; // 0 = Day, 1 = Night
    let cyclePhase = 0.0;
    const DAY_SKY = new THREE.Color(0x3B76F6);
    const NIGHT_SKY = new THREE.Color(0x050510);
    const SUNSET_SKY = new THREE.Color(0xFF6B4A);
    const SUNRISE_SKY = new THREE.Color(0xFFB347);

    const DAY_LIGHT = new THREE.Color(0xFFFFFF);
    const NIGHT_LIGHT = new THREE.Color(0x445588);
    const SUNSET_LIGHT = new THREE.Color(0xFFB89F);
    const SUNRISE_LIGHT = new THREE.Color(0xFFE5B4);

    const DAY_HEMI_SKY = new THREE.Color(0x88bbff);
    const NIGHT_HEMI_SKY = new THREE.Color(0x112244);
    const SUNSET_HEMI_SKY = new THREE.Color(0xFF9E80);
    const SUNRISE_HEMI_SKY = new THREE.Color(0xFFD180);

    // Global Light Refs
    let dirLight, hemiLight, ambientLight;

    const input = { up: false, down: false, left: false, right: false, handbrake: false };
    const vehicle = {
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
        heading: 0,
        angularVel: 0,
        speed: 0,
        isDrifting: false,
        slipAngle: 0,
        bodyRoll: 0,
        bodyPitch: 0,
        distTravelled: 0,
    };

    // Hand Tracking State
    const handTracking = {
        enabled: false,
        handDetected: false,
        lastX: 0.5, // 0 to 1
        steerValue: 0, // -1 to 1
        video: null,
        canvas: null,
        ctx: null,
        hands: null,
        camera: null,
    };

    // ─── UTILS ────────────────────────────────────────────────────────────────
    function sendMessageToFlutter(message) {
        // Handle InAppWebView (Android/iOS)
        if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('flutterHandler', message);
        }
        // Handle typical postMessage (Web iframe)
        const parent = window.parent || window.opener;
        if (parent && parent !== window) {
            parent.postMessage(message, '*');
        }
    }

    // Shared materials — moved to top for robust initialization
    const _treeTrunkMat = new THREE.MeshPhongMaterial({ color: 0x6B4F3A, flatShading: true });
    const _treeFoliageMats = [0x4CAF50, 0x66BB6A, 0x388E3C, 0x2E7D32].map(c => new THREE.MeshPhongMaterial({ color: c, flatShading: true }));
    const _rockMats = [0x8E8E8E, 0xA0A0A0, 0x707070, 0x959595].map(c => new THREE.MeshPhongMaterial({ color: c, flatShading: true }));
    const _bushMats = [0x558B2F, 0x689F38, 0x7CB342, 0x33691E].map(c => new THREE.MeshPhongMaterial({ color: c, flatShading: true }));
    const _coneMat = new THREE.MeshPhongMaterial({ color: 0xFF6D00, flatShading: true });
    const _coneStripeMat = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, flatShading: true });
    const _crateMat = new THREE.MeshPhongMaterial({ color: 0xBCAAA4, flatShading: true });
    const _crateDetailMat = new THREE.MeshPhongMaterial({ color: 0x8D6E63, flatShading: true });
    const _poleMat = new THREE.MeshPhongMaterial({ color: 0x555555, flatShading: true });
    const _lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xFFEE88, transparent: true });
    const _stemMat = new THREE.MeshPhongMaterial({ color: 0x4CAF50, flatShading: true });

    let accumulator = 0;
    let gameStarted = false;

    // World object tracking
    const worldObjects = new Map();
    const seededRng = mulberry32(42);

    // Atmosphere
    let clouds = [];
    let sunMesh, starField;

    // Road
    const roadPoints = [];
    const roadMeshes = new Map();
    let roadAngle = 0;
    let lastClosestRoadIdx = 0;
    let roadBuiltIndex = 0;

    // ─── SEEDED RNG ────────────────────────────────────────────────────────────
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function cellRng(cx, cz) {
        // Deterministic RNG per cell so objects are consistent
        const seed = cx * 73856093 ^ cz * 19349663;
        return mulberry32(seed);
    }

    // ─── INIT ──────────────────────────────────────────────────────────────────
    function init() {
        const canvas = document.getElementById('game-canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(CFG.BG_COLOR);
        renderer.shadowMap.enabled = false;

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(CFG.BG_COLOR, 0.012);

        clock = new THREE.Clock();

        // Orthographic isometric camera
        const aspect = window.innerWidth / window.innerHeight;
        const frustum = 20;
        camera = new THREE.OrthographicCamera(
            -frustum * aspect, frustum * aspect,
            frustum, -frustum, 0.1, 300
        );
        camera.position.copy(CFG.CAM_OFFSET);
        camera.lookAt(0, 0, 0);

        // Lights
        ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);
        dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
        dirLight.position.set(20, 40, 20);
        scene.add(dirLight);

        // Subtle hemisphere light for ground tint
        hemiLight = new THREE.HemisphereLight(0x88bbff, 0x3366cc, 0.3);
        scene.add(hemiLight);

        createGround();
        createPorsche911();
        createAtmosphere();
        initRoad();
        initParticlePool();
        setupInput();
        initHandTracking();

        window.addEventListener('resize', onResize);
        animate();
    }

    // ─── GROUND ────────────────────────────────────────────────────────────────
    function createGround() {
        const geo = new THREE.PlaneGeometry(600, 600);
        const mat = new THREE.MeshPhongMaterial({ color: CFG.GROUND_COLOR, flatShading: true });
        groundMesh = new THREE.Mesh(geo, mat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -0.02;
        scene.add(groundMesh);

        const gridGeo = new THREE.PlaneGeometry(600, 600, 40, 40);
        const gridMat = new THREE.MeshBasicMaterial({
            color: CFG.GROUND_GRID, wireframe: true, transparent: true, opacity: 0.08,
        });
        gridMesh = new THREE.Mesh(gridGeo, gridMat);
        gridMesh.rotation.x = -Math.PI / 2;
        gridMesh.position.y = -0.01;
        scene.add(gridMesh);
    }

    // ─── PORSCHE 911 ───────────────────────────────────────────────────────────
    function createPorsche911() {
        carGroup = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({ color: CFG.BODY_COLOR, flatShading: true });
        const glassMat = new THREE.MeshPhongMaterial({ color: CFG.GLASS_COLOR, flatShading: true, transparent: true, opacity: 0.75 });
        const tireMat = new THREE.MeshPhongMaterial({ color: CFG.TIRE_COLOR, flatShading: true });
        const darkMat = new THREE.MeshPhongMaterial({ color: 0x444444, flatShading: true });
        const chromeMat = new THREE.MeshPhongMaterial({ color: 0xCCCCCC, flatShading: true });

        // === MAIN BODY (lower) — wide, low sportscar ===
        const bodyShape = new THREE.Shape();
        bodyShape.moveTo(-1.05, 0);
        bodyShape.lineTo(-1.05, 0.45);
        bodyShape.lineTo(-0.95, 0.52);
        bodyShape.lineTo(0.95, 0.52);
        bodyShape.lineTo(1.05, 0.45);
        bodyShape.lineTo(1.05, 0);
        bodyShape.lineTo(-1.05, 0);

        const bodyExtrudeSettings = { depth: 4.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 };
        const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, bodyExtrudeSettings);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.18, -2.1);
        carGroup.add(body);

        // === FRONT HOOD (sloping down — 911 style) ===
        const hoodGeo = new THREE.BoxGeometry(1.9, 0.12, 1.0);
        const hood = new THREE.Mesh(hoodGeo, bodyMat);
        hood.position.set(0, 0.60, 1.4);
        hood.rotation.x = 0.12;
        carGroup.add(hood);

        // Front bumper
        const frontBumperGeo = new THREE.BoxGeometry(2.1, 0.25, 0.3);
        const frontBumper = new THREE.Mesh(frontBumperGeo, bodyMat);
        frontBumper.position.set(0, 0.30, 1.95);
        carGroup.add(frontBumper);

        // Front intake/grille
        const grilleGeo = new THREE.BoxGeometry(1.6, 0.15, 0.1);
        const grille = new THREE.Mesh(grilleGeo, darkMat);
        grille.position.set(0, 0.28, 2.08);
        carGroup.add(grille);

        // Front lip/splitter
        const lipGeo = new THREE.BoxGeometry(1.8, 0.06, 0.15);
        const lip = new THREE.Mesh(lipGeo, darkMat);
        lip.position.set(0, 0.17, 2.05);
        carGroup.add(lip);

        // === CABIN (911 greenhouse — slopes back) ===
        // A-pillar to roof
        const cabinGeo = new THREE.BoxGeometry(1.6, 0.50, 1.6);
        const cabin = new THREE.Mesh(cabinGeo, bodyMat);
        cabin.position.set(0, 0.96, -0.1);
        carGroup.add(cabin);

        // Roof rear slope (911 signature)
        const roofSlopeGeo = new THREE.BoxGeometry(1.5, 0.3, 1.0);
        const roofSlope = new THREE.Mesh(roofSlopeGeo, bodyMat);
        roofSlope.position.set(0, 0.82, -1.1);
        roofSlope.rotation.x = 0.35;
        carGroup.add(roofSlope);

        // === REAR (wide, muscular 911 haunches) ===
        const rearGeo = new THREE.BoxGeometry(2.15, 0.55, 0.8);
        const rear = new THREE.Mesh(rearGeo, bodyMat);
        rear.position.set(0, 0.50, -1.8);
        carGroup.add(rear);

        // Rear bumper
        const rearBumperGeo = new THREE.BoxGeometry(2.1, 0.22, 0.2);
        const rearBumper = new THREE.Mesh(rearBumperGeo, darkMat);
        rearBumper.position.set(0, 0.28, -2.18);
        carGroup.add(rearBumper);

        // Dual Exhausts
        for (let s = -1; s <= 1; s += 2) {
            const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6);
            const exhaust = new THREE.Mesh(exhaustGeo, darkMat);
            exhaust.rotation.x = Math.PI / 2;
            exhaust.position.set(s * 0.5, 0.22, -2.25);
            carGroup.add(exhaust);
        }

        // Rear spoiler (ducktail)
        const spoilerGeo = new THREE.BoxGeometry(1.7, 0.06, 0.35);
        const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
        spoiler.position.set(0, 0.80, -2.0);
        spoiler.rotation.x = -0.15;
        carGroup.add(spoiler);

        // Spoiler supports
        for (let s = -1; s <= 1; s += 2) {
            const supGeo = new THREE.BoxGeometry(0.06, 0.06, 0.30);
            const sup = new THREE.Mesh(supGeo, darkMat);
            sup.position.set(s * 0.6, 0.77, -1.95);
            carGroup.add(sup);
        }

        // === WINDSHIELD ===
        const wsGeo = new THREE.BoxGeometry(1.45, 0.42, 0.06);
        const ws = new THREE.Mesh(wsGeo, glassMat);
        ws.position.set(0, 0.92, 0.72);
        ws.rotation.x = -0.3;
        carGroup.add(ws);

        // Rear window (sloped — 911 style)
        const rwGeo = new THREE.BoxGeometry(1.35, 0.35, 0.06);
        const rw = new THREE.Mesh(rwGeo, glassMat);
        rw.position.set(0, 0.88, -0.95);
        rw.rotation.x = 0.45;
        carGroup.add(rw);

        // Side windows
        for (let s = -1; s <= 1; s += 2) {
            const swGeo = new THREE.BoxGeometry(0.06, 0.36, 1.4);
            const sw = new THREE.Mesh(swGeo, glassMat);
            sw.position.set(s * 0.80, 0.92, -0.1);
            carGroup.add(sw);
        }

        // Side mirrors
        for (let s = -1; s <= 1; s += 2) {
            const mirrorGeo = new THREE.BoxGeometry(0.18, 0.12, 0.12);
            const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
            mirror.position.set(s * 0.90, 0.85, 0.5);
            carGroup.add(mirror);
        }

        // === FENDERS (wide body 911) ===
        for (let s = -1; s <= 1; s += 2) {
            // Front fender
            const ffGeo = new THREE.BoxGeometry(0.18, 0.40, 1.4);
            const ff = new THREE.Mesh(ffGeo, bodyMat);
            ff.position.set(s * 1.03, 0.42, 0.9);
            carGroup.add(ff);

            // Rear fender (wider — 911 signature)
            const rfGeo = new THREE.BoxGeometry(0.22, 0.45, 1.2);
            const rf = new THREE.Mesh(rfGeo, bodyMat);
            rf.position.set(s * 1.10, 0.45, -1.4);
            carGroup.add(rf);
        }

        // === WHEELS ===
        const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10);
        const rimGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.23, 6);
        const rimMat = new THREE.MeshPhongMaterial({ color: 0xAAAAAA, flatShading: true });

        const wheelPositions = [
            { x: -1.08, y: 0.32, z: 1.25 },  // front left
            { x: 1.08, y: 0.32, z: 1.25 },  // front right
            { x: -1.15, y: 0.32, z: -1.45 },  // rear left (wider track)
            { x: 1.15, y: 0.32, z: -1.45 },  // rear right
        ];
        wheelPositions.forEach((pos, idx) => {
            const wGroup = new THREE.Group();
            const w = new THREE.Mesh(wheelGeo, tireMat);
            w.rotation.z = Math.PI / 2;
            wGroup.add(w);
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            wGroup.add(rim);
            wGroup.position.set(pos.x, pos.y, pos.z);
            carGroup.add(wGroup);
            wheels.push(wGroup);
        });

        // === HEADLIGHTS (round — classic 911) ===
        for (let s = -1; s <= 1; s += 2) {
            // Light housing
            const hlHousingGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.12, 8);
            const hlHousing = new THREE.Mesh(hlHousingGeo, darkMat);
            hlHousing.rotation.x = Math.PI / 2;
            hlHousing.position.set(s * 0.72, 0.58, 1.88);
            carGroup.add(hlHousing);

            // Light lens (glowing)
            const hlLensGeo = new THREE.CircleGeometry(0.16, 8);
            const hlLensMat = new THREE.MeshBasicMaterial({ color: 0xFFEE88 });
            const hlLens = new THREE.Mesh(hlLensGeo, hlLensMat);
            hlLens.position.set(s * 0.72, 0.58, 1.94);
            carGroup.add(hlLens);
        }

        // Headlight PointLights (actual illumination)
        headlightL = new THREE.PointLight(0xFFF5D0, 2.0, 20, 2);
        headlightL.position.set(-0.72, 0.58, 3.0);
        carGroup.add(headlightL);

        headlightR = new THREE.PointLight(0xFFF5D0, 2.0, 20, 2);
        headlightR.position.set(0.72, 0.58, 3.0);
        carGroup.add(headlightR);

        // Headlight glow sprites
        const glowTexture = createGlowTexture();
        const glowMatL = new THREE.SpriteMaterial({ map: glowTexture, color: 0xFFF5D0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        headlightGlowL = new THREE.Sprite(glowMatL);
        headlightGlowL.scale.set(3.5, 3.5, 1);
        headlightGlowL.position.set(-0.72, 0.58, 2.5);
        carGroup.add(headlightGlowL);

        const glowMatR = new THREE.SpriteMaterial({ map: glowTexture, color: 0xFFF5D0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        headlightGlowR = new THREE.Sprite(glowMatR);
        headlightGlowR.scale.set(3.5, 3.5, 1);
        headlightGlowR.position.set(0.72, 0.58, 2.5);
        carGroup.add(headlightGlowR);

        // === TAILLIGHTS (wide bar — modern 911) ===
        const tlBarGeo = new THREE.BoxGeometry(1.8, 0.08, 0.06);
        const tlBarMat = new THREE.MeshBasicMaterial({ color: 0xFF2222 });
        const tlBar = new THREE.Mesh(tlBarGeo, tlBarMat);
        tlBar.position.set(0, 0.62, -2.17);
        carGroup.add(tlBar);

        for (let s = -1; s <= 1; s += 2) {
            const tlGeo = new THREE.BoxGeometry(0.30, 0.14, 0.08);
            const tlMat = new THREE.MeshBasicMaterial({ color: 0xFF3333 });
            const tl = new THREE.Mesh(tlGeo, tlMat);
            tl.position.set(s * 0.85, 0.62, -2.18);
            carGroup.add(tl);
        }

        // === EXHAUST PIPES ===
        for (let s = -1; s <= 1; s += 2) {
            const exGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.15, 6);
            const ex = new THREE.Mesh(exGeo, chromeMat);
            ex.rotation.x = Math.PI / 2;
            ex.position.set(s * 0.45, 0.22, -2.22);
            carGroup.add(ex);
        }

        // === SIDE MIRRORS ===
        for (let s = -1; s <= 1; s += 2) {
            const mirrorGeo = new THREE.BoxGeometry(0.12, 0.10, 0.18);
            const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
            mirror.position.set(s * 1.05, 0.82, 0.45);
            carGroup.add(mirror);
        }

        // === DOOR LINES ===
        for (let s = -1; s <= 1; s += 2) {
            const doorLineGeo = new THREE.BoxGeometry(0.01, 0.35, 1.3);
            const doorLine = new THREE.Mesh(doorLineGeo, darkMat);
            doorLine.position.set(s * 1.06, 0.52, -0.2);
            carGroup.add(doorLine);
        }

        scene.add(carGroup);
    }

    // Create a radial gradient texture for headlight glow
    function createGlowTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255, 245, 208, 1.0)');
        gradient.addColorStop(0.3, 'rgba(255, 245, 208, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 245, 208, 0.0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    // ─── ATMOSPHERE ──────────────────────────────────────────────────────────
    function createAtmosphere() {
        // Sun
        const sunGlowTex = createGlowTexture();
        const sunMat = new THREE.SpriteMaterial({ map: sunGlowTex, color: 0xFFFF88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
        sunMesh = new THREE.Sprite(sunMat);
        sunMesh.scale.set(8, 8, 1);
        sunMesh.position.set(60, 55, -40);
        scene.add(sunMesh);
        // Sun core
        const sunCoreGeo = new THREE.CircleGeometry(24, 32);
        const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xFFF9D0 });
        const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
        sunCore.position.copy(sunMesh.position);
        scene.add(sunCore);
        // Stars
        const starGeo = new THREE.BufferGeometry();
        const starPositions = [];
        for (let i = 0; i < 80; i++) {
            starPositions.push((Math.random() - 0.5) * 200, 35 + Math.random() * 30, (Math.random() - 0.5) * 200);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
        starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.25, transparent: true, opacity: 0.35 }));
        scene.add(starField);
    }

    function createCloud() {
        const group = new THREE.Group();
        const cloudMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.55 });
        const puffCount = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < puffCount; i++) {
            const r = 1.5 + Math.random() * 2.0;
            const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 4, 3), cloudMat);
            puff.position.set((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 3);
            puff.scale.y = 0.4 + Math.random() * 0.3;
            group.add(puff);
        }
        const s = 0.6 + Math.random() * 0.6;
        group.scale.set(s, s * 0.5, s);
        return group;
    }

    function updateAtmosphere(dt) {
        sunMesh.position.x = vehicle.pos.x + 60;
        sunMesh.position.z = vehicle.pos.z - 40;

        // Sink the sun as night approaches
        sunMesh.position.y = 55 - (dayNightRatio * 80);
        sunMesh.material.opacity = (1.0 - dayNightRatio) * 0.9;

        if (starField) {
            starField.position.x = vehicle.pos.x;
            starField.position.z = vehicle.pos.z;
            starField.material.opacity = dayNightRatio * (0.4 + Math.sin(clock.getElapsedTime() * 0.5) * 0.2);
        }

        // Interpolate Global Colors
        let currentSky, currentLight, currentHemi;

        if (cyclePhase < 0.4) {
            currentSky = DAY_SKY.clone();
            currentLight = DAY_LIGHT.clone();
            currentHemi = DAY_HEMI_SKY.clone();
        } else if (cyclePhase < 0.45) {
            let t = (cyclePhase - 0.4) / 0.05;
            currentSky = DAY_SKY.clone().lerp(SUNSET_SKY, t);
            currentLight = DAY_LIGHT.clone().lerp(SUNSET_LIGHT, t);
            currentHemi = DAY_HEMI_SKY.clone().lerp(SUNSET_HEMI_SKY, t);
        } else if (cyclePhase < 0.5) {
            let t = (cyclePhase - 0.45) / 0.05;
            currentSky = SUNSET_SKY.clone().lerp(NIGHT_SKY, t);
            currentLight = SUNSET_LIGHT.clone().lerp(NIGHT_LIGHT, t);
            currentHemi = SUNSET_HEMI_SKY.clone().lerp(NIGHT_HEMI_SKY, t);
        } else if (cyclePhase < 0.9) {
            currentSky = NIGHT_SKY.clone();
            currentLight = NIGHT_LIGHT.clone();
            currentHemi = NIGHT_HEMI_SKY.clone();
        } else if (cyclePhase < 0.95) {
            let t = (cyclePhase - 0.9) / 0.05;
            currentSky = NIGHT_SKY.clone().lerp(SUNRISE_SKY, t);
            currentLight = NIGHT_LIGHT.clone().lerp(SUNRISE_LIGHT, t);
            currentHemi = NIGHT_HEMI_SKY.clone().lerp(SUNRISE_HEMI_SKY, t);
        } else {
            let t = (cyclePhase - 0.95) / 0.05;
            currentSky = SUNRISE_SKY.clone().lerp(DAY_SKY, t);
            currentLight = SUNRISE_LIGHT.clone().lerp(DAY_LIGHT, t);
            currentHemi = SUNRISE_HEMI_SKY.clone().lerp(DAY_HEMI_SKY, t);
        }

        renderer.setClearColor(currentSky);
        scene.fog.color.copy(currentSky);
        scene.fog.density = 0.012 + (dayNightRatio * 0.005); // slightly thicker fog at night

        dirLight.color.copy(currentLight);
        dirLight.intensity = 0.75 - (dayNightRatio * 0.5);
        ambientLight.color.copy(currentLight);
        ambientLight.intensity = 0.65 - (dayNightRatio * 0.4);

        hemiLight.color.copy(currentHemi);
    }

    // ─── ROAD SYSTEM (optimized) ───────────────────────────────────────────
    function initRoad() {
        roadPoints.push({ x: 0, z: 0 });
        for (let i = 0; i < CFG.ROAD_AHEAD + 4; i++) extendRoadPoint();
        rebuildRoadMeshes();
    }

    function extendRoadPoint() {
        const last = roadPoints[roadPoints.length - 1];
        roadAngle += (Math.random() - 0.5) * 0.8;
        roadPoints.push({
            x: last.x + Math.sin(roadAngle) * CFG.ROAD_SEG_LEN,
            z: last.z + Math.cos(roadAngle) * CFG.ROAD_SEG_LEN,
        });
    }

    function isPointOnRoad(wx, wz) {
        const hw = CFG.ROAD_WIDTH * 0.75;
        const startIdx = Math.max(0, lastClosestRoadIdx - 20);
        for (let i = startIdx; i < roadPoints.length - 1; i++) {
            const a = roadPoints[i], b = roadPoints[i + 1];
            const abx = b.x - a.x, abz = b.z - a.z;
            const len2 = abx * abx + abz * abz;
            if (len2 < 0.01) continue;
            let t = ((wx - a.x) * abx + (wz - a.z) * abz) / len2;
            t = Math.max(0, Math.min(1, t));
            const dx = wx - (a.x + t * abx), dz = wz - (a.z + t * abz);
            if (dx * dx + dz * dz < hw * hw) return true;
        }
        return false;
    }

    function rebuildRoadMeshes() {
        // Remove old far meshes
        for (const [idx, mesh] of roadMeshes) {
            const pt = roadPoints[Math.min(idx + 1, roadPoints.length - 1)];
            if (!pt) continue;
            const dx = pt.x - vehicle.pos.x, dz = pt.z - vehicle.pos.z;
            if (dx * dx + dz * dz > CFG.DESPAWN_RADIUS * CFG.DESPAWN_RADIUS * 4) {
                scene.remove(mesh);
                mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
                roadMeshes.delete(idx);
            }
        }
        // Cached materials — never recreate
        if (!rebuildRoadMeshes._roadMat) {
            rebuildRoadMeshes._roadMat = new THREE.MeshPhongMaterial({ color: CFG.ROAD_COLOR, flatShading: true });
            rebuildRoadMeshes._lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        }
        const roadMat = rebuildRoadMeshes._roadMat;
        const lineMat = rebuildRoadMeshes._lineMat;
        const startIdx = Math.max(0, lastClosestRoadIdx - 20);
        for (let i = startIdx; i < roadPoints.length - 1; i++) {
            if (roadMeshes.has(i)) continue;
            const a = roadPoints[i], b = roadPoints[i + 1];
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 0.1) continue;
            const nx = -dz / len, nz = dx / len;
            const hw = CFG.ROAD_WIDTH / 2;
            // Road surface
            const g = new THREE.Group();
            const rGeo = new THREE.BufferGeometry();
            rGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                a.x - nx * hw, 0.005, a.z - nz * hw,
                a.x + nx * hw, 0.005, a.z + nz * hw,
                b.x + nx * hw, 0.005, b.z + nz * hw,
                b.x - nx * hw, 0.005, b.z - nz * hw,
            ], 3));
            rGeo.setIndex([0, 1, 2, 0, 2, 3]);
            rGeo.computeVertexNormals();
            g.add(new THREE.Mesh(rGeo, roadMat));
            // Single center line (one thin quad per segment)
            const lw = 0.1, dirX = dx / len, dirZ = dz / len;
            // Default dashed center line
            if (i % 2 === 0) {
                const lGeo = new THREE.BufferGeometry();
                lGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                    a.x - nx * lw, 0.01, a.z - nz * lw,
                    a.x + nx * lw, 0.01, a.z + nz * lw,
                    b.x + nx * lw, 0.01, b.z + nz * lw,
                    b.x - nx * lw, 0.01, b.z - nz * lw,
                ], 3));
                lGeo.setIndex([0, 1, 2, 0, 2, 3]);
                lGeo.computeVertexNormals();
                g.add(new THREE.Mesh(lGeo, lineMat));
            }

            // Continuous Edge lines
            const elw = 0.15;
            const edDist = hw - 0.4; // distance from center
            const eGeo = new THREE.BufferGeometry();
            eGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                // Left edge
                a.x - nx * edDist - nx * elw, 0.01, a.z - nz * edDist - nz * elw,
                a.x - nx * edDist + nx * elw, 0.01, a.z - nz * edDist + nz * elw,
                b.x - nx * edDist + nx * elw, 0.01, b.z - nz * edDist + nz * elw,
                b.x - nx * edDist - nx * elw, 0.01, b.z - nz * edDist - nz * elw,
                // Right edge
                a.x + nx * edDist - nx * elw, 0.01, a.z + nz * edDist - nz * elw,
                a.x + nx * edDist + nx * elw, 0.01, a.z + nz * edDist + nz * elw,
                b.x + nx * edDist + nx * elw, 0.01, b.z + nz * edDist + nz * elw,
                b.x + nx * edDist - nx * elw, 0.01, b.z + nz * edDist - nz * elw,
            ], 3));
            eGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
            eGeo.computeVertexNormals();
            g.add(new THREE.Mesh(eGeo, lineMat));

            // Rumble strips (red and white alternating blocks on the outside)
            if (!rebuildRoadMeshes._rumbleRedMat) { rebuildRoadMeshes._rumbleRedMat = new THREE.MeshBasicMaterial({ color: 0xCC2222 }); }
            const rumbDist = hw - 0.15;
            const rumbW = 0.3;
            const rumbMat = (i % 2 === 0) ? rebuildRoadMeshes._rumbleRedMat : lineMat;
            const rumbGeo = new THREE.BufferGeometry();
            rumbGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                // Left Rumble
                a.x - nx * rumbDist - nx * rumbW, 0.012, a.z - nz * rumbDist - nz * rumbW,
                a.x - nx * rumbDist + nx * rumbW, 0.012, a.z - nz * rumbDist + nz * rumbW,
                b.x - nx * rumbDist + nx * rumbW, 0.012, b.z - nz * rumbDist + nz * rumbW,
                b.x - nx * rumbDist - nx * rumbW, 0.012, b.z - nz * rumbDist - nz * rumbW,
                // Right Rumble
                a.x + nx * rumbDist - nx * rumbW, 0.012, a.z + nz * rumbDist - nz * rumbW,
                a.x + nx * rumbDist + nx * rumbW, 0.012, a.z + nz * rumbDist + nz * rumbW,
                b.x + nx * rumbDist + nx * rumbW, 0.012, b.z + nz * rumbDist + nz * rumbW,
                b.x + nx * rumbDist - nx * rumbW, 0.012, b.z + nz * rumbDist - nz * rumbW,
            ], 3));
            rumbGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
            rumbGeo.computeVertexNormals();
            g.add(new THREE.Mesh(rumbGeo, rumbMat));

            // Lamp posts (every 5 segments, alternating sides along the road)
            if (i % 5 === 0) {
                const side = (i % 10 === 0) ? -1 : 1;
                const lamp = createLampPost();
                lamp.position.set(a.x + nx * (hw + 1.2) * side, 0, a.z + nz * (hw + 1.2) * side);
                lamp.rotation.y = Math.atan2(nx, nz) + (side === 1 ? Math.PI : 0);
                g.add(lamp);
            }

            scene.add(g);
            roadMeshes.set(i, g);
        }
    }

    function updateRoad() {
        let minDist = Infinity, closestIdx = lastClosestRoadIdx;
        const startIdx = Math.max(0, lastClosestRoadIdx - 5);
        for (let i = startIdx; i < roadPoints.length; i++) {
            const dx = roadPoints[i].x - vehicle.pos.x, dz = roadPoints[i].z - vehicle.pos.z;
            const d = dx * dx + dz * dz;
            if (d < minDist) { minDist = d; closestIdx = i; }
        }
        lastClosestRoadIdx = closestIdx;
        while (roadPoints.length - closestIdx < CFG.ROAD_AHEAD) extendRoadPoint();
        rebuildRoadMeshes();
    }


    // â”€â”€â”€ WORLD GENERATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const objPools = { tree: [], rock: [], bush: [], flowers: [], cone: [], crate: [] };
    function getPooled(type, createFn, rng) {
        let obj;
        if (objPools[type] && objPools[type].length > 0) {
            obj = objPools[type].pop();
        } else {
            obj = createFn(rng);
            obj.userData.type = type;
        }
        scene.add(obj);
        return obj;
    }

    function updateWorldObjects() {
        const playerCellX = Math.floor(vehicle.pos.x / CFG.CELL_SIZE);
        const playerCellZ = Math.floor(vehicle.pos.z / CFG.CELL_SIZE);
        const cellRange = Math.ceil(CFG.SPAWN_RADIUS / CFG.CELL_SIZE);
        for (let cx = playerCellX - cellRange; cx <= playerCellX + cellRange; cx++) {
            for (let cz = playerCellZ - cellRange; cz <= playerCellZ + cellRange; cz++) {
                const key = cx + ',' + cz;
                if (worldObjects.has(key)) continue;
                const cellWorldX = cx * CFG.CELL_SIZE + CFG.CELL_SIZE / 2;
                const cellWorldZ = cz * CFG.CELL_SIZE + CFG.CELL_SIZE / 2;
                const dist = Math.sqrt(Math.pow(cellWorldX - vehicle.pos.x, 2) + Math.pow(cellWorldZ - vehicle.pos.z, 2));
                if (dist > CFG.SPAWN_RADIUS) continue;
                if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) { worldObjects.set(key, []); continue; }
                if (isPointOnRoad(cellWorldX, cellWorldZ)) { worldObjects.set(key, []); continue; }
                const rng = cellRng(cx, cz);
                const meshes = [];
                if (rng() < CFG.OBJECT_DENSITY) {
                    const roll = rng();
                    const offsetX = (rng() - 0.5) * CFG.CELL_SIZE * 0.8;
                    const offsetZ = (rng() - 0.5) * CFG.CELL_SIZE * 0.8;
                    const wx = cellWorldX + offsetX, wz = cellWorldZ + offsetZ;
                    if (roll < 0.35) {
                        const tree = getPooled('tree', createTree, rng); tree.position.set(wx, 0, wz); tree.rotation.y = rng() * Math.PI * 2; meshes.push(tree);
                    } else if (roll < 0.50) {
                        const rock = getPooled('rock', createRock, rng); rock.position.set(wx, 0, wz); rock.rotation.y = rng() * Math.PI * 2; meshes.push(rock);
                    } else if (roll < 0.70) {
                        const bush = getPooled('bush', createBush, rng); bush.position.set(wx, 0, wz); meshes.push(bush);
                    } else if (roll < 0.85) {
                        const flowers = getPooled('flowers', createFlowerPatch, rng); flowers.position.set(wx, 0, wz); meshes.push(flowers);
                    } else if (roll < 0.92) {
                        const cone = getPooled('cone', createCone, rng); cone.position.set(wx, 0, wz); meshes.push(cone);
                    } else {
                        const crate = getPooled('crate', createCrate, rng); crate.position.set(wx, 0, wz); crate.rotation.y = rng() * Math.PI; meshes.push(crate);
                    }
                }
                worldObjects.set(key, meshes);
            }
        }
        for (const [key, meshes] of worldObjects) {
            const [cxStr, czStr] = key.split(',');
            const cx = parseInt(cxStr), cz = parseInt(czStr);
            const cellWorldX = cx * CFG.CELL_SIZE + CFG.CELL_SIZE / 2;
            const cellWorldZ = cz * CFG.CELL_SIZE + CFG.CELL_SIZE / 2;
            const dist = Math.sqrt(Math.pow(cellWorldX - vehicle.pos.x, 2) + Math.pow(cellWorldZ - vehicle.pos.z, 2));
            if (dist > CFG.DESPAWN_RADIUS) {
                meshes.forEach(m => {
                    scene.remove(m);
                    if (m.userData.type && objPools[m.userData.type]) {
                        objPools[m.userData.type].push(m);
                    } else {
                        if (m.traverse) m.traverse(c => { if (c.geometry) c.geometry.dispose(); });
                    }
                });
                worldObjects.delete(key);
            }
        }
    }

    // ─── ENHANCED OBJECT FACTORIES ──────────────────────────────────────────

    function createTree(rng) {
        const group = new THREE.Group();
        const trunkH = 2.0 + rng() * 2.0, trunkR = 0.15 + rng() * 0.1;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6), _treeTrunkMat);
        trunk.position.y = trunkH / 2; group.add(trunk);

        const layers = 3 + Math.floor(rng() * 3);
        const fMat = _treeFoliageMats[Math.floor(rng() * _treeFoliageMats.length)];
        const isPine = rng() > 0.4;

        if (isPine) {
            // Pine tree style (steep overlapping cones)
            for (let i = 0; i < layers; i++) {
                const h = 1.8 + rng() * 0.6;
                const w = (1.8 - i * 0.3) + rng() * 0.2;
                const f = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), fMat);
                f.position.y = trunkH * 0.6 + i * 0.9;
                group.add(f);
            }
        } else {
            // Oak/Round style (overlapping icospheres)
            const clusterCount = layers * 2;
            for (let i = 0; i < clusterCount; i++) {
                const r = 1.0 + rng() * 0.8;
                const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), fMat);
                f.position.set((rng() - 0.5) * 1.5, trunkH + (rng() - 0.2) * 2.5, (rng() - 0.5) * 1.5);
                f.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
                group.add(f);
            }
        }

        const scale = 0.8 + rng() * 0.8; group.scale.set(scale, scale, scale);
        return group;
    }
    function createRock(rng) {
        const group = new THREE.Group();
        const mat = _rockMats[Math.floor(rng() * _rockMats.length)];
        const size = 0.5 + rng() * 1.2;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat);
        rock.position.y = size * 0.4; rock.scale.set(1.0 + rng() * 0.3, 0.4 + rng() * 0.3, 1.0 + rng() * 0.3);
        rock.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3); group.add(rock);
        if (rng() > 0.4) {
            const s2 = size * (0.25 + rng() * 0.3);
            const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(s2, 0), mat);
            r2.position.set((rng() - 0.5) * size * 1.5, s2 * 0.35, (rng() - 0.5) * size * 1.5);
            r2.scale.y = 0.5 + rng() * 0.3; group.add(r2);
        }
        return group;
    }

    function createBush(rng) {
        const group = new THREE.Group();
        const mat = _bushMats[Math.floor(rng() * _bushMats.length)];
        for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
            const r = 0.4 + rng() * 0.5;
            const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
            sphere.position.set((rng() - 0.5) * 1.0, r * 0.55, (rng() - 0.5) * 1.0);
            sphere.scale.y = 0.6 + rng() * 0.4; group.add(sphere);
        }
        return group;
    }

    function createFlowerPatch(rng) {
        const group = new THREE.Group();
        const flowerColors = [0xFF5252, 0xFFEB3B, 0xE91E63, 0xAB47BC, 0xFF7043];
        for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
            const fx = (rng() - 0.5) * 1.5, fz = (rng() - 0.5) * 1.5, h = 0.3 + rng() * 0.4;
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 3), _stemMat);
            stem.position.set(fx, h / 2, fz); group.add(stem);
            const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 3), new THREE.MeshBasicMaterial({ color: fc }));
            head.position.set(fx, h + 0.04, fz); group.add(head);
        }
        return group;
    }

    function createCone() {
        const group = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 5), _coneMat);
        cone.position.set(0, 0.45, 0); group.add(cone);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 5), _coneStripeMat);
        stripe.position.set(0, 0.45, 0); group.add(stripe);
        return group;
    }

    function createCrate(rng) {
        const size = 0.6 + rng() * 0.5;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), _crateMat);
        crate.position.y = size / 2;
        return crate;
    }

    function createLampPost() {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 4.5, 5), _poleMat);
        pole.position.set(0, 2.25, 0); group.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.0), _poleMat);
        arm.position.set(0, 4.4, 0.45); group.add(arm);
        const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), _lampGlowMat);
        lampGlow.position.set(0, 4.35, 0.9); group.add(lampGlow);

        // Add point light for night time
        const light = new THREE.PointLight(0xFFEE88, 0.0, 40);
        light.position.set(0, 4.0, 0.9);
        group.add(light);
        group.userData.isLamp = true;
        group.userData.light = light;
        group.userData.glow = lampGlow;

        return group;
    }

    // â”€â”€â”€ PARTICLE POOL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function initParticlePool() {
        const geo = new THREE.SphereGeometry(0.25, 5, 3);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });
        particlePool = { count: CFG.PARTICLE_COUNT, mesh: new THREE.InstancedMesh(geo, mat, CFG.PARTICLE_COUNT), active: new Array(CFG.PARTICLE_COUNT).fill(false), life: new Float32Array(CFG.PARTICLE_COUNT), maxLife: new Float32Array(CFG.PARTICLE_COUNT), positions: [], velocities: [], scales: [], nextIndex: 0 };
        const dummy = new THREE.Matrix4(); dummy.makeScale(0, 0, 0);
        for (let i = 0; i < CFG.PARTICLE_COUNT; i++) { particlePool.mesh.setMatrixAt(i, dummy); particlePool.positions.push(new THREE.Vector3()); particlePool.velocities.push(new THREE.Vector3()); particlePool.scales.push(0); }
        particlePool.mesh.instanceMatrix.needsUpdate = true; scene.add(particlePool.mesh);
    }
    function spawnParticle(pos, vel) {
        const pool = particlePool, idx = pool.nextIndex; pool.nextIndex = (pool.nextIndex + 1) % pool.count;
        pool.active[idx] = true; pool.life[idx] = 1.0; pool.maxLife[idx] = 0.8 + Math.random() * 0.6;
        pool.positions[idx].copy(pos); pool.velocities[idx].copy(vel); pool.scales[idx] = 0.1;
    }
    function updateParticles(dt) {
        const pool = particlePool, dummy = new THREE.Matrix4(); let anyUpdate = false;
        for (let i = 0; i < pool.count; i++) {
            if (!pool.active[i]) continue; anyUpdate = true;
            pool.life[i] -= dt / pool.maxLife[i];
            if (pool.life[i] <= 0) { pool.active[i] = false; dummy.makeScale(0, 0, 0); pool.mesh.setMatrixAt(i, dummy); continue; }
            pool.positions[i].add(pool.velocities[i].clone().multiplyScalar(dt)); pool.positions[i].y += dt * 1.5;
            const lifeRatio = pool.life[i];
            const scale = lifeRatio > 0.85 ? 0.1 + ((1.0 - lifeRatio) / 0.15) * 1.4 : lifeRatio / 0.85 * 1.5;
            pool.scales[i] = scale; pool.velocities[i].multiplyScalar(0.985);
            dummy.makeScale(scale, scale, scale); dummy.setPosition(pool.positions[i]); pool.mesh.setMatrixAt(i, dummy);
        }
        if (anyUpdate) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    function emitSmoke(isHeavy) {
        const v = vehicle;
        const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
        const right = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
        const rearL = v.pos.clone().add(fwd.clone().multiplyScalar(-1.5)).add(right.clone().multiplyScalar(-1.0)); rearL.y = 0.15;
        const rearR = v.pos.clone().add(fwd.clone().multiplyScalar(-1.5)).add(right.clone().multiplyScalar(1.0)); rearR.y = 0.15;
        const exhaust = v.pos.clone().add(fwd.clone().multiplyScalar(-2.3)); exhaust.y = 0.22;
        const rate = isHeavy ? Math.min(CFG.PARTICLE_SPAWN_RATE, Math.floor(Math.abs(v.slipAngle) * 10)) : (Math.random() > 0.4 ? 1 : 0);
        for (let i = 0; i < rate; i++) {
            const baseVel = v.vel.clone().multiplyScalar(-0.12); baseVel.y = 0.4 + Math.random() * 0.6;
            baseVel.x += (Math.random() - 0.5) * 1.5; baseVel.z += (Math.random() - 0.5) * 1.5;
            if (isHeavy) { const sp = i % 2 === 0 ? rearL.clone() : rearR.clone(); sp.x += (Math.random() - 0.5) * 0.4; sp.z += (Math.random() - 0.5) * 0.4; spawnParticle(sp, baseVel); }
            else { const sp = exhaust.clone(); sp.x += (Math.random() - 0.5) * 0.2; sp.z += (Math.random() - 0.5) * 0.2; baseVel.multiplyScalar(0.5); spawnParticle(sp, baseVel); }
        }
    }

    // â”€â”€â”€ INPUT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function setupInput() {
        document.addEventListener('keydown', e => {
            if (e.repeat) return;
            switch (e.code) { case 'ArrowUp': case 'KeyW': input.up = true; break; case 'ArrowDown': case 'KeyS': input.down = true; break; case 'ArrowLeft': case 'KeyA': input.left = true; break; case 'ArrowRight': case 'KeyD': input.right = true; break; case 'Space': input.handbrake = true; break; }
            if (!gameStarted && (input.up || input.down || input.left || input.right)) { gameStarted = true; initAudio(); window.parent.postMessage({ type: 'gameStarted' }, '*'); }
            playUIClick();
        });
        document.addEventListener('keyup', e => {
            switch (e.code) { case 'ArrowUp': case 'KeyW': input.up = false; break; case 'ArrowDown': case 'KeyS': input.down = false; break; case 'ArrowLeft': case 'KeyA': input.left = false; break; case 'ArrowRight': case 'KeyD': input.right = false; break; case 'Space': input.handbrake = false; break; }
        });
    }

    // ─── HAND TRACKING ─────────────────────────────────────────────────────────
    function initHandTracking() {
        const videoElement = document.getElementsByClassName('input-video')[0];
        const canvasElement = document.getElementsByClassName('output-canvas')[0];
        const btn = document.getElementById('hand-tracking-btn');
        const statusText = document.getElementById('status-text');
        const statusDot = document.querySelector('.status-dot');
        const preview = document.getElementById('camera-preview');

        if (!videoElement || !canvasElement || !btn) return;

        handTracking.video = videoElement;
        handTracking.canvas = canvasElement;
        handTracking.ctx = canvasElement.getContext('2d');

        const hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        hands.onResults(onHandResults);

        btn.addEventListener('click', async () => {
            if (!handTracking.enabled) {
                try {
                    statusText.textContent = 'Starting Camera...';
                    if (!handTracking.camera) {
                        handTracking.camera = new Camera(videoElement, {
                            onFrame: async () => {
                                await hands.send({ image: videoElement });
                            },
                            width: 640,
                            height: 480
                        });
                    }
                    await handTracking.camera.start();
                    handTracking.enabled = true;
                    btn.textContent = 'Disable Hand Tracking';
                    btn.classList.add('active');
                    preview.style.display = 'block';
                    statusText.textContent = 'Tracking Active';
                    statusDot.classList.add('active');

                    if (!gameStarted) {
                        gameStarted = true;
                        initAudio();
                        sendMessageToFlutter({ type: 'gameStarted' });
                    }
                } catch (err) {
                    console.error('Camera failed:', err);
                    statusText.textContent = 'Camera Error';
                    handTracking.enabled = false;
                }
            } else {
                handTracking.enabled = false;
                btn.textContent = 'Enable Hand Tracking';
                btn.classList.remove('active');
                preview.style.display = 'none';
                statusText.textContent = 'Hand Tracking OFF';
                statusDot.classList.remove('active');
                handTracking.handDetected = false;
            }
        });

        handTracking.hands = hands;
    }

    function onHandResults(results) {
        const { ctx, canvas } = handTracking;
        if (!ctx) return;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            handTracking.handDetected = true;

            // Draw landmarks for all detected hands
            for (const landmarks of results.multiHandLandmarks) {
                ctx.fillStyle = '#10B981';
                for (const landmark of landmarks) {
                    ctx.beginPath();
                    ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 2, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }

            if (results.multiHandLandmarks.length >= 2) {
                // Steering Wheel Logic (Two Hands)
                // Sort by X to identify Left and Right hands (x=0 is screen left)
                const sortedHands = [...results.multiHandLandmarks].sort((a, b) => a[9].x - b[9].x);
                const leftHand = sortedHands[0][9];
                const rightHand = sortedHands[1][9];

                const dx = rightHand.x - leftHand.x;
                const dy = rightHand.y - leftHand.y;

                // dy > 0 means right hand is lower than left hand (steering right)
                // In game, right steering means steerValue is negative.
                // Multiplying by 15 for extreme sensitivity/accuracy as requested.
                handTracking.steerValue = -(dy / Math.max(dx, 0.1)) * 15.0;
                handTracking.lastX = (leftHand.x + rightHand.x) / 2;
            } else {
                // One Hand Logic
                const landmarks = results.multiHandLandmarks[0];
                const x = landmarks[9].x;
                handTracking.lastX = x;

                // Increased sensitivity multiplier for extreme accuracy
                handTracking.steerValue = (0.5 - x) * 15.0;
            }
        } else {
            handTracking.handDetected = false;
        }
        ctx.restore();
    }

    // â”€â”€â”€ AUDIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function initAudio() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            engineOsc = audioCtx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 45;
            const ef = audioCtx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 180;
            engineGain = audioCtx.createGain(); engineGain.gain.value = 0.06;
            engineOsc.connect(ef); ef.connect(engineGain); engineGain.connect(audioCtx.destination); engineOsc.start();
            const bs = audioCtx.sampleRate * 2, nb = audioCtx.createBuffer(1, bs, audioCtx.sampleRate), d = nb.getChannelData(0);
            for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
            driftNoiseNode = audioCtx.createBufferSource(); driftNoiseNode.buffer = nb; driftNoiseNode.loop = true;
            const df = audioCtx.createBiquadFilter(); df.type = 'bandpass'; df.frequency.value = 700; df.Q.value = 0.5;
            driftGain = audioCtx.createGain(); driftGain.gain.value = 0;
            driftNoiseNode.connect(df); df.connect(driftGain); driftGain.connect(audioCtx.destination); driftNoiseNode.start();
        } catch (e) { console.warn('Audio init failed:', e); }
    }
    function updateAudio() {
        if (!audioCtx) return;
        const sn = Math.abs(vehicle.speed) / CFG.TOP_SPEED;
        if (engineOsc) { engineOsc.frequency.value = 45 + sn * 160; engineGain.gain.value = 0.03 + sn * 0.09; }
        if (driftGain) { driftGain.gain.linearRampToValueAtTime((vehicle.isDrifting ? Math.min(Math.abs(vehicle.slipAngle) * 1.5, 1.0) : 0) * 0.12, audioCtx.currentTime + 0.05); }
    }
    function playUIClick() {
        if (!audioCtx) return;
        try { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 600; const g = audioCtx.createGain(); g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.08); } catch (e) { }
    }

    // â”€â”€â”€ PHYSICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function fixedUpdate(dt) {
        const v = vehicle, fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading), rightX = Math.cos(v.heading), rightZ = -Math.sin(v.heading);
        if (input.up) { const ac = 1.0 - (v.speed / CFG.TOP_SPEED) * 0.6; v.vel.x += fwdX * CFG.ACCEL * ac * dt; v.vel.z += fwdZ * CFG.ACCEL * ac * dt; }
        if (input.down) { v.vel.x -= fwdX * CFG.BRAKE * dt; v.vel.z -= fwdZ * CFG.BRAKE * dt; }

        let steerInput = 0;
        if (handTracking.enabled && handTracking.handDetected) {
            // Auto drive straight + Hand steering
            input.up = true;
            steerInput = Math.max(-1, Math.min(1, handTracking.steerValue));
        } else {
            if (input.left) steerInput = 1; if (input.right) steerInput = -1;
        }

        const speedRatio = Math.min(v.speed / CFG.TOP_SPEED, 1.0);
        let steerSpeed = CFG.STEER_SPEED * (1.0 - speedRatio * 0.55) + CFG.STEER_SPEED_HIGH * speedRatio * 0.55;

        // Boost steering speed for hand tracking to make it feel "immediate" and accurate
        if (handTracking.enabled && handTracking.handDetected) {
            steerSpeed *= 3.5;
        }

        if (steerInput !== 0 && v.speed > 0.3) v.angularVel += steerInput * steerSpeed * dt;
        v.angularVel *= CFG.ANGULAR_DAMP; v.heading += v.angularVel * dt;
        const forwardSpeed = v.vel.x * fwdX + v.vel.z * fwdZ, lateralSpeed = v.vel.x * rightX + v.vel.z * rightZ;
        v.slipAngle = Math.abs(forwardSpeed) > 0.1 ? Math.atan2(lateralSpeed, Math.abs(forwardSpeed)) : 0;
        const handbraking = input.handbrake && v.speed > 1.5;
        v.isDrifting = (Math.abs(v.slipAngle) > CFG.DRIFT_THRESHOLD && v.speed > 2) || handbraking;
        const gripFactor = handbraking ? CFG.HANDBRAKE_GRIP : (v.isDrifting ? CFG.GRIP_DRIFT : CFG.GRIP_NORMAL);
        v.vel.x = fwdX * forwardSpeed + rightX * lateralSpeed * gripFactor;
        v.vel.z = fwdZ * forwardSpeed + rightZ * lateralSpeed * gripFactor;
        if (handbraking) { v.vel.x *= 0.995; v.vel.z *= 0.995; }
        v.vel.x *= CFG.DRAG; v.vel.z *= CFG.DRAG;
        v.speed = Math.sqrt(v.vel.x * v.vel.x + v.vel.z * v.vel.z);
        if (v.speed > CFG.TOP_SPEED) { const r = CFG.TOP_SPEED / v.speed; v.vel.x *= r; v.vel.z *= r; v.speed = CFG.TOP_SPEED; }
        v.pos.x += v.vel.x * dt; v.pos.z += v.vel.z * dt;
        v.distTravelled += v.speed * dt;
        v.bodyRoll += (-steerInput * Math.min(v.speed * 0.015, 0.08) - v.bodyRoll) * 6 * dt;
        v.bodyPitch += (((input.down ? 0.04 : 0) + (input.up ? -0.02 : 0)) - v.bodyPitch) * 5 * dt;
        const isBurnout = input.up && v.speed < 2 && v.speed > 0.1;
        if (v.isDrifting || isBurnout || handbraking) emitSmoke(true); else if (v.speed > 0.1) emitSmoke(false);
        if (gameStarted) sendMessageToFlutter({ type: 'gameState', speed: Math.round(v.speed * 10), drifting: v.isDrifting });
    }

    // â”€â”€â”€ RENDER UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let worldUpdateTimer = 0;
    function updateVisuals(dt) {
        const v = vehicle;

        // Calculate Day/Night Transition (looping)
        const CYCLE_LENGTH = 2000;
        cyclePhase = (v.distTravelled % CYCLE_LENGTH) / CYCLE_LENGTH;

        if (cyclePhase < 0.4) {
            dayNightRatio = 0.0;
        } else if (cyclePhase < 0.5) {
            dayNightRatio = (cyclePhase - 0.4) / 0.1;
        } else if (cyclePhase < 0.9) {
            dayNightRatio = 1.0;
        } else {
            dayNightRatio = 1.0 - ((cyclePhase - 0.9) / 0.1);
        }

        carGroup.position.set(v.pos.x, 0, v.pos.z); carGroup.rotation.y = v.heading;
        carGroup.rotation.z = v.bodyRoll; carGroup.rotation.x = v.bodyPitch;
        const wr = v.speed * dt * 5; wheels.forEach(w => { w.children[0].rotation.x += wr; w.children[1].rotation.x += wr; });
        const time = clock.getElapsedTime();

        // Headlights fade in with night
        const hlBase = dayNightRatio * 3.0; // max intensity at night
        const hl = hlBase > 0.1 ? (v.isDrifting ? hlBase + Math.sin(time * 20) * 0.3 : hlBase) : 0;
        headlightL.intensity = hl; headlightR.intensity = hl;
        const gs = hlBase > 0.1 ? (2.5 + (v.isDrifting ? Math.sin(time * 15) * 0.5 : 0)) * dayNightRatio : 0.001;
        headlightGlowL.scale.set(gs, gs, 1); headlightGlowR.scale.set(gs, gs, 1);

        // Update active streetlights
        for (const [key, meshes] of worldObjects) {
            for (let i = 0; i < meshes.length; i++) {
                if (meshes[i].userData.isLamp) {
                    meshes[i].userData.light.intensity = dayNightRatio * 2.0;
                    meshes[i].userData.glow.material.opacity = 0.2 + (dayNightRatio * 0.8);
                }
            }
        }
        for (const [idx, roadGroup] of roadMeshes) {
            roadGroup.children.forEach(c => {
                if (c.userData.isLamp) {
                    c.userData.light.intensity = dayNightRatio * 2.0;
                    c.userData.glow.material.opacity = 0.2 + (dayNightRatio * 0.8);
                }
            });
        }

        camera.position.copy(v.pos.clone().add(CFG.CAM_OFFSET)); camera.lookAt(v.pos.clone());
        groundMesh.position.x = v.pos.x; groundMesh.position.z = v.pos.z;
        gridMesh.position.x = v.pos.x; gridMesh.position.z = v.pos.z;
        worldUpdateTimer += dt;
        if (worldUpdateTimer > 0.3) { worldUpdateTimer = 0; updateRoad(); updateWorldObjects(); }
        updateAtmosphere(dt); updateParticles(dt); updateAudio();
    }

    // â”€â”€â”€ MAIN LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function animate() {
        requestAnimationFrame(animate);
        const frameDt = Math.min(clock.getDelta(), 0.1);
        accumulator += frameDt;
        while (accumulator >= CFG.FIXED_DT) { fixedUpdate(CFG.FIXED_DT); accumulator -= CFG.FIXED_DT; }
        updateVisuals(frameDt); renderer.render(scene, camera);
    }

    // â”€â”€â”€ RESIZE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function onResize() {
        const w = window.innerWidth, h = window.innerHeight, a = w / h, f = 20;
        camera.left = -f * a; camera.right = f * a; camera.top = f; camera.bottom = -f;
        camera.updateProjectionMatrix(); renderer.setSize(w, h);
    }

    // â”€â”€â”€ BOOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
