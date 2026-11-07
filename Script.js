// ================================================================
// Super Vario – Script principal
// ================================================================

document.addEventListener('DOMContentLoaded', () => {

// ---------- État global ----------
let rawPressure = 1013.25;
let rawAccelZ = 0;
let simulationTime = 0;
let altitudeSimulee = 0;
let avgPressure = 1013.25;
let avgAccelZ = 0;
let loopInterval = null;
let mixLisse = 0;
let hasPressureSensor = false;
let hasAccelSensor = false;
let simulePression = false;
let simuleAccel = false;
let deviceMotionHandler = null;
let pressionArretee = false;
let accelArretee = false;
let facteurZoom = 1;
let pinchStartDist = 0;
let pinchStartZoom = 1;
const pointers = new Map();
let longPressTimer = null;
let dragActif = false;
let dragStartX = 0;
let dragStartY = 0;
let varioStartX = 0;
let varioStartY = 0;
let tailleCongelee = false; // dimensions du vario gelées en mode masqué
let overlayLance = false;   // vrai si la fenêtre flottante Android a été lancée depuis cette page
let minuterieArrierePlanOverlay = null;

let accelRefuse = false;
// Vitesse verticale estimée par l'accéléromètre seul (m/s) : intégrale de l'accélération,
// avec « fuite » pour éviter la dérive. C'est elle (et non l'accélération) qui pilote le son.
// ---- Réglages de la réactivité accéléromètre (à ajuster à l'essai) ----
const TAU_VITESSE_ACCEL = 0.8;   // s : mémoire de l'intégrateur (plus petit = moins de rémanence)
const CALME_DELAI_S = 0.25;      // s sans mouvement avant de ramener la vitesse à zéro
const TAU_VITESSE_CALME = 0.12;  // s : vitesse de retour à zéro dans ce cas
const VITESSE_ANTI_RESSORT = 0.25; // m/s : franchissement de zéro sous ce seuil = on arrête (pas de rebond)
const SEUIL_DECEL_ACCEL = 0.12;  // m/s² : accélération opposée à la vitesse = fin du geste
const VERROU_MS = 800;           // ms : après la fin d'un geste, la phase de freinage est ignorée
const LISSAGE_MIX = 0.6;         // 0 à 1 : plus petit = signal plus vif (avant : 0,75)
const ZONE_MORTE_ACCEL = 0.08;   // m/s² : en dessous, on considère que c'est du bruit
const TAU_BIAIS_ACCEL = 4.0;     // s : le décalage permanent du capteur est retiré en continu
const SEUIL_SON_MINI = 0.05;     // plancher des seuils (unité du mix) : un seuil à 0 déclencherait sur le bruit
const HYSTERESIS_SON = 0.5;      // un son en cours ne s'arrête que sous 50 % de son seuil
const DUREE_MINI_SON_MS = 150;   // un son démarré joue au moins 150 ms
let biaisAccel = 0;
let verrouJusqua = 0;            // fin du verrou anti-retour (ms)
let directionVerrou = 0;         // sens du geste terminé (+1 haut, -1 bas)
let calmeAccel = 0;              // durée (s) pendant laquelle l'accélération reste dans la zone morte
let debutSonAuto = 0;
let vitesseAccel = 0;
let accelFiltree = 0;          // accélération verticale lissée (filtre passe-bas)
let dernierTempsFiltreAccel = 0;

// ---------- Persistance du refus accéléromètre ----------
const CLE_REFUS_ACCEL = 'SuperVario.accelRefuse';

function sauverRefusAccel() {
    localStorage.setItem(CLE_REFUS_ACCEL, accelRefuse ? '1' : '0');
}

function lireRefusAccel() {
    return localStorage.getItem(CLE_REFUS_ACCEL) === '1';
}

// ---------- Références DOM ----------
const sliderP = document.getElementById('gainPressure');
const sliderA = document.getElementById('gainAccel');
const sliderCadence = document.getElementById('gainCadence');
const sliderPartage = document.getElementById('gainPartage');
const sliderVolume = document.getElementById('gainVolume');
const sliderSeuilMonte = document.getElementById('seuilMonte');
const sliderSeuilBaisse = document.getElementById('seuilBaisse');
const sliderSonAigu = document.getElementById('sonAigu');
const sliderSonGraves = document.getElementById('sonGraves');
const voyantAccel = document.getElementById('voyantAccel');
const voyantPression = document.getElementById('voyantPression');
const btnStopPression = document.getElementById('btnStopPression');
const sliderAmplitudeAiguille = document.getElementById('amplitudeAiguille');
const varioStack = document.getElementById('varioStack');
const varioContent = document.querySelector('.vario-content');
const varioContainer = document.getElementById('varioContainer');
const visualDisplay = document.querySelector('.visual-display');
const sliderAmortissement = document.getElementById('amortissementAccel');
const affichageAmortissement = document.getElementById('txtAmortissementAccel');
const labelSimulationPression = document.getElementById('labelSimulationPression');
const labelSimulationAccel = document.getElementById('labelSimulationAccel');
const appBody = document.getElementById('appBody');
const btnHamburger = document.getElementById('btnHamburger');
const sliderLargeur = document.getElementById('largeurVario');
const sliderHauteur = document.getElementById('hauteurVario');
const txtHauteurVario = document.getElementById('txtHauteurVario');
const sliderAlphaVario = document.getElementById('alphaVario');
const txtAlphaVario = document.getElementById('txtAlphaVario');
const coloriageVz = document.querySelector('.vario-fg');
const txtLargeurVario = document.getElementById('txtLargeurVario');
const btnTestMonte = document.getElementById('btnTestMonte');
const btnTestBaisse = document.getElementById('btnTestBaisse');
const sliderLissageP = document.getElementById('lissagePressure');
const affichageLissageP = document.getElementById('txtLissagePressure');

// ---------- Déblocage audio ----------
const audioMonte = new Audio();
const audioBaisse = new Audio();

audioMonte.loop = true;
audioBaisse.loop = true;

const debloquerAudio = async () => {
    if (typeof initAudio === 'function') {
        try { await initAudio(); } catch (e) { console.warn(e); }
    }

    for (const audio of [audioMonte, audioBaisse]) {
        audio.muted = true;
        try {
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {
            console.warn('Déblocage audio impossible :', e);
        }
        audio.muted = false;
    }

    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'running') {
        document.removeEventListener('pointerdown', debloquerAudio);
        document.removeEventListener('touchstart', debloquerAudio);
        console.log('Audio débloqué.');
    }
};

// ---------- Fenêtre flottante : le glisser-déposer est géré côté Android ----------
// (appui long puis glisser, avec les coordonnées écran réelles : voir OverlayService.kt).
// Ici on empêche seulement la logique de glisser/zoom de la page principale de s'activer.
const estModeOverlay = () => document.documentElement.classList.contains('overlay-mode');
const pontNatif = () => window.SuperVarioBridge || window.AndroidBaro;

if (varioContent) {
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
        varioContent.addEventListener(type, (event) => {
            if (!estModeOverlay()) return;
            if (event.target.closest('#btnHamburger')) return;
            event.stopPropagation();
        });
    });
}

btnHamburger?.addEventListener('pointerdown', (event) => {
    if (document.documentElement.classList.contains('overlay-mode')) event.stopPropagation();
});

document.addEventListener('pointerdown', debloquerAudio, { passive: true });
document.addEventListener('touchstart', debloquerAudio, { passive: true });

// ---------- Arrêt ----------
document.getElementById('btnClose')?.addEventListener('click', () => {
    const bridge = window.SuperVarioBridge || window.AndroidBaro;

    if (bridge && typeof bridge.exitApp === 'function') {
        bridge.exitApp();
        return;
    }

    if (
        window.navigator &&
        window.navigator.app &&
        typeof window.navigator.app.exitApp === 'function'
    ) {
        window.navigator.app.exitApp();
        return;
    }

    window.close();
});

// ---------- Références DOM pour la configuration ----------
const btnEnregistrer = document.getElementById('btnEnregistrer');
const btnLire = document.getElementById('btnLire');

// ---------- Enregistrement ----------
function construireConfig() {
    return {
        cadence: sliderCadence?.value,
        partage: sliderPartage?.value,
        largeur: sliderLargeur?.value,
        hauteur: sliderHauteur?.value,
        alpha: sliderAlphaVario?.value,
        amplitude: sliderAmplitudeAiguille?.value,
        volume: sliderVolume?.value,
        sonAigu: sliderSonAigu?.value,
        sonGraves: sliderSonGraves?.value,
        seuilMonte: sliderSeuilMonte?.value,
        seuilBaisse: sliderSeuilBaisse?.value,
        gainP: sliderP?.value,
        gainA: sliderA?.value,
        amortissement: sliderAmortissement?.value,
        lissageP: sliderLissageP?.value,
        stopAccel: accelArretee,
        stopPression: pressionArretee,
        accelRefuse: accelRefuse,
        sonMonte: sonMonteChoisi,
        sonBaisse: sonBaisseChoisi
    };
}

btnEnregistrer?.addEventListener('click', () => {
    const configData = construireConfig();

    localStorage.setItem('SuperVario.cfg', JSON.stringify(configData));

    btnEnregistrer.classList.add('test-actif');
    setTimeout(() => btnEnregistrer.classList.remove('test-actif'), 500);
});

// ===== Vraie verticale (filtre complémentaire quaternion) =====
const GRAVITE = 9.81;
const KP_VERTICALE = 1.0;
const PORTE_DYNAMIQUE = 0.18;
const ATTENUATION_DYNAMIQUE = 0.3;

// Unité du gyroscope (rotationRate) : degrés par seconde selon la spécification, sur iOS comme
// sur les Chrome/WebView Android récents. Seuls les très anciens Chrome Android donnaient des rad/s.
// Se tromper dans ce sens est sans gravité (le filtre se recale sur la gravité), alors que
// prendre des degrés pour des radians multiplie les rotations par 57 et fausse toute la verticale.
const FACTEUR_ROTATION = Math.PI / 180;

// Sens de l'accélération verticale : 1 = normal ; -1 si le son « monte » quand on descend.
const SIGNE_ACCEL = 1;

let qAttitude = [1, 0, 0, 0];
let verticaleInitialisee = false;
let dernierTempsMouvement = 0;

function normaliserQuaternion(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function multiplierQuaternions(a, b) {
    return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
}

function quaternionDepuisRotation(rx, ry, rz) {
    const angle = Math.hypot(rx, ry, rz);
    if (angle < 1e-9) return [1, 0, 0, 0];
    const s = Math.sin(angle / 2) / angle;
    return [Math.cos(angle / 2), rx * s, ry * s, rz * s];
}

function verticaleEstimeeCorps() {
    const w = qAttitude[0], x = qAttitude[1], y = qAttitude[2], z = qAttitude[3];
    return [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

function initialiserVerticale(fx, fy, fz) {
    const n = Math.hypot(fx, fy, fz);
    if (n < 1e-6) return;
    const ax = fx / n, ay = fy / n, az = fz / n;
    qAttitude = (1 + az < 1e-6)
        ? [0, 1, 0, 0]
        : normaliserQuaternion([1 + az, ay, -ax, 0]);
    verticaleInitialisee = true;
}

function traiterMouvement(acc, rotationRate, maintenantMs) {
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return null;
    if (Number.isNaN(acc.x) || Number.isNaN(acc.y) || Number.isNaN(acc.z)) return null;

    const dtBrut = dernierTempsMouvement > 0 ? (maintenantMs - dernierTempsMouvement) / 1000 : 0;
    dernierTempsMouvement = maintenantMs;
    const dt = Math.min(0.2, Math.max(0.002, dtBrut));

    if (!verticaleInitialisee) initialiserVerticale(acc.x, acc.y, acc.z);

    if (rotationRate && rotationRate.alpha !== null && !Number.isNaN(rotationRate.alpha)) {
        const wx = (rotationRate.beta || 0) * FACTEUR_ROTATION;
        const wy = (rotationRate.gamma || 0) * FACTEUR_ROTATION;
        const wz = (rotationRate.alpha || 0) * FACTEUR_ROTATION;
        qAttitude = normaliserQuaternion(multiplierQuaternions(
            qAttitude, quaternionDepuisRotation(wx * dt, wy * dt, wz * dt)));
    }

    const normeF = Math.hypot(acc.x, acc.y, acc.z);
    if (normeF > 1e-6) {
        const ecart = Math.abs(normeF - GRAVITE) / GRAVITE;
        if (ecart < PORTE_DYNAMIQUE) {
            const poids = 1 / (1 + (ecart / ATTENUATION_DYNAMIQUE) ** 2);
            const f = [acc.x / normeF, acc.y / normeF, acc.z / normeF];
            const g = verticaleEstimeeCorps();
            const ex = f[1] * g[2] - f[2] * g[1];
            const ey = f[2] * g[0] - f[0] * g[2];
            const ez = f[0] * g[1] - f[1] * g[0];
            qAttitude = normaliserQuaternion(multiplierQuaternions(
                qAttitude,
                quaternionDepuisRotation(
                    KP_VERTICALE * poids * ex * dt,
                    KP_VERTICALE * poids * ey * dt,
                    KP_VERTICALE * poids * ez * dt)));
        }
    }

    const g = verticaleEstimeeCorps();
    return (acc.x * g[0] + acc.y * g[1] + acc.z * g[2]) - GRAVITE;
}
// ===== Fin vraie verticale =====

// ---------- Écoute accéléromètre ----------
function demarrerEcouteAccel() {
    if (deviceMotionHandler || !window.DeviceMotionEvent) return;
    deviceMotionHandler = (e) => {
        if (accelArretee || accelRefuse) return;
        const aBrute = traiterMouvement(
            e.accelerationIncludingGravity, e.rotationRate, performance.now());
        if (aBrute !== null) {
            const aVerticale = SIGNE_ACCEL * aBrute;
            // Filtre passe-bas à CHAQUE échantillon (~60 Hz), avant l'échantillonnage de la boucle
            // à 100 ms : sans lui, on ne prend qu'une mesure brute sur six et le bruit
            // (tremblement de la main, vibrations) est replié dans le signal.
            // Le curseur « Amortissement » règle la constante de temps (0 % = 0,02 s ; 100 % = 0,62 s).
            const maintenant = performance.now();
            if (dernierTempsFiltreAccel === 0) {      // première mesure : on part de l'état courant
                accelFiltree = aVerticale;
                biaisAccel = aVerticale;
            }
            const dtF = Math.min(0.2, Math.max(0.001, (maintenant - dernierTempsFiltreAccel) / 1000));
            dernierTempsFiltreAccel = maintenant;
            const tau = 0.02 + (Number(sliderAmortissement?.value ?? 20) / 100) * 0.6;
            accelFiltree += (dtF / (tau + dtF)) * (aVerticale - accelFiltree);

            rawAccelZ = accelFiltree;

            // Retire le décalage permanent (capteur non calibré à 9,81, inclinaison résiduelle) :
            // sans cela, un décalage de 0,3 m/s² donne une « vitesse » de 0,6 m/s en permanence.
            biaisAccel += (dtF / (TAU_BIAIS_ACCEL + dtF)) * (accelFiltree - biaisAccel);
            const aSansBiais = accelFiltree - biaisAccel;
            let aUtile = Math.abs(aSansBiais) < ZONE_MORTE_ACCEL ? 0 : aSansBiais;

            // Anti-retour (« boomerang ») : un geste vers le haut se termine par un freinage, qui
            // serait lu comme un mouvement vers le bas (et inversement). Dès que l'accélération
            // s'oppose à la vitesse, le geste est terminé : on coupe la vitesse (le son s'arrête)
            // et on ignore le freinage pendant VERROU_MS. La pression prend ensuite le relais.
            if (vitesseAccel !== 0 && Math.abs(aUtile) > SEUIL_DECEL_ACCEL
                && Math.sign(aUtile) !== Math.sign(vitesseAccel)) {
                directionVerrou = Math.sign(vitesseAccel);
                verrouJusqua = maintenant + VERROU_MS;
                vitesseAccel = 0;
                aUtile = 0;
            } else if (maintenant < verrouJusqua && Math.sign(aUtile) === -directionVerrou) {
                aUtile = 0;
            }

            // Immobilité : la vitesse est ramenée vite à zéro.
            calmeAccel = aUtile === 0 ? calmeAccel + dtF : 0;
            const tauV = calmeAccel > CALME_DELAI_S ? TAU_VITESSE_CALME : TAU_VITESSE_ACCEL;

            // Intégration : accélération -> vitesse verticale.
            const vitessePrec = vitesseAccel;
            vitesseAccel = vitesseAccel * Math.exp(-dtF / tauV) + aUtile * dtF;

            // Anti-ressort : quand la décélération ramène la vitesse à zéro, elle ne doit pas
            // la faire passer de l'autre côté (ce serait un faux son inverse après chaque geste).
            if (vitessePrec * vitesseAccel < 0 && Math.abs(vitesseAccel) < VITESSE_ANTI_RESSORT) {
                vitesseAccel = 0;
            }
            if (!hasAccelSensor) {
                hasAccelSensor = true;
                mettreAJourVoyants();
                mettreAJourAffichageCapteurs();
            }
        }
    };
    window.addEventListener('devicemotion', deviceMotionHandler, { passive: true });
}

function arreterEcouteAccel() {
    if (deviceMotionHandler) {
        window.removeEventListener('devicemotion', deviceMotionHandler, { passive: true });
        deviceMotionHandler = null;
    }
    qAttitude = [1, 0, 0, 0];
    verticaleInitialisee = false;
    dernierTempsMouvement = 0;
    hasAccelSensor = false;
    rawAccelZ = 0;
    accelFiltree = 0;
    vitesseAccel = 0;
    biaisAccel = 0;
    calmeAccel = 0;
    verrouJusqua = 0;
    directionVerrou = 0;
    dernierTempsFiltreAccel = 0;
    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
}

// ---------- Lecture / Chargement ----------
btnLire?.addEventListener('click', () => {
    const saved = localStorage.getItem('SuperVario.cfg');

    if (!saved) {
        console.warn('Aucun réglage sauvegardé trouvé.');
        return;
    }

    try {
        appliquerConfiguration(JSON.parse(saved));
        btnLire.classList.add('test-actif');
        setTimeout(() => btnLire.classList.remove('test-actif'), 500);
    } catch (e) {
        console.warn('Erreur lors du chargement de SuperVario.cfg', e);
    }
});

function appliquerConfiguration(cfg) {
    const appliquer = (slider, valeur) => {
        if (slider && valeur !== undefined) {
            slider.value = valeur;
            slider.dispatchEvent(new Event('input'));
        }
    };

    appliquer(sliderCadence, cfg.cadence);
    appliquer(sliderPartage, cfg.partage);
    appliquer(sliderLargeur, cfg.largeur);
    appliquer(sliderHauteur, cfg.hauteur);
    appliquer(sliderAlphaVario, cfg.alpha);
    appliquer(sliderAmplitudeAiguille, cfg.amplitude);
    appliquer(sliderVolume, cfg.volume);
    appliquer(sliderSonAigu, cfg.sonAigu);
    appliquer(sliderSonGraves, cfg.sonGraves);
    appliquer(sliderSeuilMonte, cfg.seuilMonte);
    appliquer(sliderSeuilBaisse, cfg.seuilBaisse);
    appliquer(sliderP, cfg.gainP);
    appliquer(sliderA, cfg.gainA);
    appliquer(sliderAmortissement, cfg.amortissement);
    appliquer(sliderLissageP, cfg.lissageP);

    if (cfg.stopPression !== undefined) {
        pressionArretee = !!cfg.stopPression;
        const img = btnStopPression?.querySelector('img');
        if (img) img.src = pressionArretee ? 'Images/marche.png' : 'Images/arret.png';
        if (btnStopPression) {
            btnStopPression.title = pressionArretee
                ? 'Reprendre le baromètre'
                : 'Arrêter le baromètre';
        }
        mettreAJourVoyants();
        mettreAJourAffichageCapteurs();
    }

    if (cfg.stopAccel !== undefined) {
        accelArretee = !!cfg.stopAccel;
        const img = document.getElementById('imgStopAccel');
        const btn = document.getElementById('btnStopAccel');
        if (img) img.src = accelArretee ? 'Images/marche.png' : 'Images/arret.png';
        if (btn) {
            btn.title = accelArretee
                ? "Reprendre l'accéléromètre"
                : "Arrêter l'accéléromètre";
        }
        mettreAJourVoyants();
        mettreAJourAffichageCapteurs();
    }

    if (cfg.accelRefuse !== undefined) {
        accelRefuse = !!cfg.accelRefuse;
        if (accelRefuse) {
            accelArretee = false;
            sauverRefusAccel();
            arreterEcouteAccel();
        } else {
            sauverRefusAccel();
            demarrerEcouteAccel();
        }
    }

    if (cfg.sonMonte) choisirSon('M', cfg.sonMonte);
    if (cfg.sonBaisse) choisirSon('B', cfg.sonBaisse);
}

// ---------- Simulations ----------
document.getElementById('btnTestAccel')?.addEventListener('click', async () => {
    simuleAccel = !simuleAccel;
    simulePression = false;

    const btnA = document.getElementById('btnTestAccel');
    const btnP = document.getElementById('btnTestPression');

    btnA?.classList.toggle('test-on', simuleAccel);
    btnA?.classList.toggle('test-actif', simuleAccel);
    btnP?.classList.remove('test-on', 'test-actif');

    if (simuleAccel && sliderPartage) {
        sliderPartage.value = 0;
        sliderPartage.dispatchEvent(new Event('input'));
    } else {
        reinitialiserPartage();
    }

    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
    mettreAJourLabelSimulation();
});

document.getElementById('btnTestPression')?.addEventListener('click', async () => {
    simulePression = !simulePression;
    simuleAccel = false;

    const btnP = document.getElementById('btnTestPression');
    const btnA = document.getElementById('btnTestAccel');

    btnP?.classList.toggle('test-on', simulePression);
    btnP?.classList.toggle('test-actif', simulePression);
    btnA?.classList.remove('test-on', 'test-actif');

    if (simulePression && sliderPartage) {
        sliderPartage.value = 100;
        sliderPartage.dispatchEvent(new Event('input'));
    } else {
        reinitialiserPartage();
    }

    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
    mettreAJourLabelSimulation();
});

// ---------- Lecture des sons WAV ----------
let sonMonteChoisi = 'M2';
let sonBaisseChoisi = 'B4';
let sonAutoEnCours = null;
let testSonEnCours = false;

audioMonte.addEventListener('ended', () => {
    if (sonAutoEnCours === 'M') sonAutoEnCours = null;
});
audioBaisse.addEventListener('ended', () => {
    if (sonAutoEnCours === 'B') sonAutoEnCours = null;
});

function reglerVolumeAudio() {
    const volume = Number(sliderVolume?.value ?? 80) / 100;
    audioMonte.volume = volume;
    audioBaisse.volume = volume;
}

function afficherChoixSon(visible = true, groupeClignotant = null) {
    document.querySelectorAll('.btn-sound').forEach((bouton) => {
        const son = bouton.dataset.sound;
        const img = bouton.querySelector('img');

        const estChoisi = son === sonMonteChoisi || son === sonBaisseChoisi;
        const appartientAuGroupe = groupeClignotant === null || son.startsWith(groupeClignotant);

        bouton.classList.toggle('choix-actif', estChoisi);

        if (img) {
            img.src = estChoisi && (!appartientAuGroupe || visible)
                ? 'Images/choix.png'
                : 'Images/potentiel.png';
        }
    });
}

function choisirSon(type, nom) {
    const audio = type === 'M' ? audioMonte : audioBaisse;

    if (type === 'M') {
        sonMonteChoisi = nom;
        const valAigu = Number(sliderSonAigu?.value ?? 50);
        audio.playbackRate = Number((0.5 + (valAigu / 50)).toFixed(2));
    } else {
        sonBaisseChoisi = nom;
        const valGrave = Number(sliderSonGraves?.value ?? 50);
        audio.playbackRate = Number((0.5 + (valGrave / 50)).toFixed(2));
    }

    audio.pause();
    audio.currentTime = 0;
    audio.src = `Sons/${nom}.wav`;
    audio._nomSon = nom;
    audio.load();
    afficherChoixSon();
}

function jouerSonSelectionne(valeurMixee) {
    if (testSonEnCours) return;

    const seuilMonte = Math.max(Number(sliderSeuilMonte?.value ?? 0), SEUIL_SON_MINI);
    const seuilBaisse = Math.max(Number(sliderSeuilBaisse?.value ?? 0), SEUIL_SON_MINI);
    const maintenant = performance.now();

    // Hystérésis : un son déjà lancé continue tant qu'on reste au-dessus de la moitié du seuil.
    // Évite de couper/relancer le son à chaque fois que le signal frôle le seuil.
    const monteDeja = sonAutoEnCours === 'M';
    const baisseDeja = sonAutoEnCours === 'B';
    let type = null;

    if (valeurMixee > (monteDeja ? seuilMonte * HYSTERESIS_SON : seuilMonte)) type = 'M';
    else if (valeurMixee < -(baisseDeja ? seuilBaisse * HYSTERESIS_SON : seuilBaisse)) type = 'B';

    if (!type) {
        // Durée minimale : un son qui vient de démarrer n'est pas coupé aussitôt.
        if (sonAutoEnCours && maintenant - debutSonAuto < DUREE_MINI_SON_MS) return;

        audioMonte.pause();
        audioBaisse.pause();
        sonAutoEnCours = null;
        return;
    }

    const audioVise = type === 'M' ? audioMonte : audioBaisse;
    const sonVise = type === 'M' ? sonMonteChoisi : sonBaisseChoisi;

    if (sonAutoEnCours === type && !audioVise.paused) return;

    const autreAudio = type === 'M' ? audioBaisse : audioMonte;
    autreAudio.pause();
    autreAudio.currentTime = 0;

    // Ne réaffecte src que si le fichier change : réaffecter le même src relance un
    // chargement complet (plusieurs centaines de ms sous Android), d'où la latence.
    if (audioVise._nomSon !== sonVise) {
        audioVise.src = `Sons/${sonVise}.wav`;
        audioVise._nomSon = sonVise;
    }
    audioVise.loop = true;
    audioVise.currentTime = 0;
    sonAutoEnCours = type;
    debutSonAuto = maintenant;

    reglerVolumeAudio();
    audioVise.play().catch(err => {
        console.warn('Lecture automatique du son impossible :', err);
        sonAutoEnCours = null;
    });
}

document.querySelectorAll('.btn-sound').forEach((bouton) => {
    bouton.addEventListener('click', () => {
        const nom = bouton.dataset.sound;
        if (!nom) return;

        choisirSon(nom.startsWith('M') ? 'M' : 'B', nom);
    });
});

function activerLecturePendantAppui(bouton, audio, groupe) {
    if (!bouton) return;

    const etat = { actif: false, clignotement: null, iconeVisible: true };
    const registre = activerLecturePendantAppui._registre
        || (activerLecturePendantAppui._registre = new Map());
    registre.set(bouton, etat);

    function arreter() {
        etat.actif = false;
        testSonEnCours = false;

        audio.pause();
        audio.currentTime = 0;
        bouton.classList.remove('test-actif');

        clearInterval(etat.clignotement);
        etat.clignotement = null;

        afficherChoixSon(true, groupe);
    }

    async function demarrer() {
        registre.forEach((autreEtat, autreBouton) => {
            if (autreBouton !== bouton && autreEtat.actif) {
                autreEtat.actif = false;
                autreBouton.classList.remove('test-actif');
                clearInterval(autreEtat.clignotement);
                autreEtat.clignotement = null;
            }
        });

        const autreAudio = audio === audioMonte ? audioBaisse : audioMonte;
        autreAudio.pause();
        autreAudio.currentTime = 0;

        etat.actif = true;
        testSonEnCours = true;

        bouton.classList.add('test-actif');
        audio.loop = true;
        etat.iconeVisible = true;
        afficherChoixSon(true, groupe);

        etat.clignotement = setInterval(() => {
            etat.iconeVisible = !etat.iconeVisible;
            afficherChoixSon(etat.iconeVisible, groupe);
        }, 350);

        reglerVolumeAudio();

        try {
            await audio.play();
            // Ne pas laisser le bouton actif si le son a été interrompu entre-temps.
            if (audio.paused || !etat.actif) arreter();
        } catch (erreur) {
            console.warn('Lecture WAV impossible :', erreur);
            arreter();
        }
    }

    bouton.addEventListener('click', (e) => {
        e.preventDefault();
        if (etat.actif) arreter();
        else demarrer();
    });

    audio.addEventListener('pause', () => {
        if (etat.actif) arreter();
    });

    audio.addEventListener('ended', () => {
        if (etat.actif) arreter();
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        audioMonte.pause();
        audioBaisse.pause();
    }
});
activerLecturePendantAppui(btnTestMonte, audioMonte, 'M');
activerLecturePendantAppui(btnTestBaisse, audioBaisse, 'B');

choisirSon('M', 'M2');
choisirSon('B', 'B4');
reglerVolumeAudio();

// ---------- Voyants ----------
function reglerVoyant(img, etat) {
    if (!img) return;

    const fichier = etat === 'ok'
        ? (img.id === 'voyantAccel' ? 'voyantAccel.png' : 'voyantPression.png')
        : 'voyantNeutre.png';

    img.src = `Images/${fichier}`;
    img.classList.remove('ok', 'neutre');
    img.classList.add(etat === 'ok' ? 'ok' : 'neutre');
}

function mettreAJourVoyants() {
    reglerVoyant(
        voyantPression,
        (!pressionArretee && (hasPressureSensor || simulePression)) ? 'ok' : 'neutre'
    );

    reglerVoyant(
        voyantAccel,
        (!accelArretee && (hasAccelSensor || simuleAccel)) ? 'ok' : 'neutre'
    );
}

btnStopPression?.addEventListener('click', () => {
    pressionArretee = !pressionArretee;
    const img = btnStopPression.querySelector('img');

    if (pressionArretee) {
        if (img) img.src = 'Images/marche.png';
        btnStopPression.title = 'Reprendre le baromètre';
    } else {
        if (img) img.src = 'Images/arret.png';
        btnStopPression.title = 'Arrêter le baromètre';
    }

    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
});

const btnStopAccel = document.getElementById('btnStopAccel');
let longPressStopAccel = null;

btnStopAccel?.addEventListener('pointerdown', () => {
    longPressStopAccel = setTimeout(() => {
        accelRefuse = true;
        accelArretee = false;
        sauverRefusAccel();
        arreterEcouteAccel();

        const img = document.getElementById('imgStopAccel');
        if (img) img.src = 'Images/arret.png';
        btnStopAccel.title = "Accéléromètre désactivé (appui long pour réactiver)";

        mettreAJourVoyants();
        mettreAJourAffichageCapteurs();
        mettreAJourLabelSimulation();
    }, 800);
});

btnStopAccel?.addEventListener('pointerup', () => clearTimeout(longPressStopAccel));
btnStopAccel?.addEventListener('pointerleave', () => clearTimeout(longPressStopAccel));

btnStopAccel?.addEventListener('click', () => {
    if (accelRefuse) {
        accelRefuse = false;
        sauverRefusAccel();
        accelArretee = false;
        demarrerEcouteAccel();
        const img = document.getElementById('imgStopAccel');
        if (img) img.src = 'Images/arret.png';
        btnStopAccel.title = "Arrêter l'accéléromètre";
        mettreAJourVoyants();
        mettreAJourAffichageCapteurs();
        return;
    }

    accelArretee = !accelArretee;
    const img = document.getElementById('imgStopAccel');

    if (accelArretee) {
        if (img) img.src = 'Images/marche.png';
        btnStopAccel.title = "Reprendre l'accéléromètre";
    } else {
        if (img) img.src = 'Images/arret.png';
        btnStopAccel.title = "Arrêter l'accéléromètre";
    }

    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
});

function mettreAJourLabelSimulation() {
    if (labelSimulationPression) {
        labelSimulationPression.classList.toggle('visible', simulePression);
        labelSimulationPression.style.color = '#00e676';
    }

    if (labelSimulationAccel) {
        labelSimulationAccel.classList.toggle('visible', simuleAccel);
        labelSimulationAccel.style.color = '#ff9800';
    }
}

// ---------- Graphiques ----------
function creerGraphique(canvasId, label, couleur) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(30).fill(''),
            datasets: [{
                label,
                data: Array(30).fill(null),
                borderColor: couleur,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: { x: { display: false }, y: { display: true } },
            plugins: { legend: { display: false } }
        }
    });
}

const pressureChart = creerGraphique('pressureChart', 'Pression', '#00e676');
const accelChart = creerGraphique('accelChart', 'Accélération', '#ff9800');

function pushData(graphique, valeur) {
    if (!graphique) return;

    const donnees = graphique.data.datasets[0].data;
    donnees.shift();
    donnees.push(Number(valeur));
    graphique.update('none');
}

// ---------- Sliders ----------
sliderP?.addEventListener('input', (e) => {
    document.getElementById('txtGainPressure').textContent = e.target.value + 'x';
});

sliderA?.addEventListener('input', (e) => {
    document.getElementById('txtGainAccel').textContent = e.target.value + 'x';
});

sliderVolume?.addEventListener('input', (e) => {
    document.getElementById('txtVolume').textContent = e.target.value + '%';
    reglerVolumeAudio();
});

sliderSonAigu?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    document.getElementById('txtSonAigu').textContent = val + '%';
    audioMonte.playbackRate = Number((0.5 + (val / 50)).toFixed(2));
});

sliderSonGraves?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    document.getElementById('txtSonGraves').textContent = val + '%';
    audioBaisse.playbackRate = Number((0.5 + (val / 50)).toFixed(2));
});

sliderLissageP?.addEventListener('input', (e) => {
    if (affichageLissageP) {
        affichageLissageP.textContent = e.target.value + '%';
    }
});

sliderSeuilMonte?.addEventListener('input', (e) => {
    document.getElementById('txtSeuilMonte').textContent = Number(e.target.value).toFixed(1) + ' m/s';
});

sliderSeuilBaisse?.addEventListener('input', (e) => {
    document.getElementById('txtSeuilBaisse').textContent = Number(e.target.value).toFixed(1) + ' m/s';
});

sliderPartage?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    document.getElementById('txtPartage').textContent = `${val}/${100 - val}`;
    e.target.style.setProperty('--pression', `${val}%`);
});
// Synchronise l'affichage initial du slider avec sa valeur HTML (90/10).
sliderPartage?.dispatchEvent(new Event('input'));

sliderCadence?.addEventListener('input', (e) => {
    const ms = Number(e.target.value);
    document.getElementById('txtCadence').textContent = ms + ' ms';

    document.documentElement.style.setProperty(
        '--cadence-anim',
        (ms / 1000).toFixed(2) + 's'
    );

    if (loopInterval !== null) {
        clearInterval(loopInterval);
        loopInterval = setInterval(traiterEtMixer, ms);
    }
});

sliderAmplitudeAiguille?.addEventListener('input', (e) => {
    document.getElementById('txtAmplitudeAiguille').textContent = e.target.value;
});

// ---------- Gel / libération de la taille de .vario-content ----------
// ✅ Principe : la taille à transmettre est celle de .vario-content
// AVANT que .box-center ne passe en position:fixed; inset:0.
// C'est cette taille héritée qui est figée en px, pas celle mesurée
// après le toggle (qui serait la taille plein écran).
function congelerTailleVario(dimensions) {
    if (!varioContent || !dimensions) return;

    varioContent.style.width = `${dimensions.width}px`;
    varioContent.style.height = `${dimensions.height}px`;
    // ✅ `flex: 0 0 auto` empêche le parent étiré (width:100%) de
    // déformer .vario-content : il garde SES dimensions.
    varioContent.style.flex = '0 0 auto';
    tailleCongelee = true;
}

function recalculerDispositionVario() {
    if (dragActif) return;

    tailleCongelee = false;

    if (varioContainer) {
        varioContainer.style.position = '';
        varioContainer.style.left = '';
        varioContainer.style.top = '';
        varioContainer.style.width = '';
        varioContainer.style.height = '';
        varioContainer.style.transform = '';
    }

    if (varioContent) {
        varioContent.style.width = '';
        varioContent.style.height = '';
        varioContent.style.flex = '';   // ✅ restaure le flex d'origine
    }

    appliquerTailleVario();
}

if (screen.orientation) {
    screen.orientation.addEventListener('change', () => {
        recalculerDispositionVario();
    });
} else {
    window.addEventListener('orientationchange', () => {
        setTimeout(recalculerDispositionVario, 50);
    });
}

window.addEventListener('resize', () => {
    if (!document.hidden) recalculerDispositionVario();
});

// ---------- Menu hamburger = masquage + fenêtre flottante (Android) ----------
const imgHamburger = document.getElementById('imgHamburger');

function mettreAJourIconeHamburger(masque) {
    if (imgHamburger) imgHamburger.src = masque ? 'Images/param2.gif' : 'Images/param.gif';
}

/** Classe sur <html> pour les règles CSS de transparence (évite de dépendre de :has). */
function synchroniserClasseMasquePage() {
    const masque = !!(appBody?.classList.contains('settings-hidden')
        || document.documentElement.classList.contains('overlay-mode'));
    document.documentElement.classList.toggle('settings-hidden-page', masque);
}

function afficherInterface() {
    appBody.classList.remove('settings-hidden');
    synchroniserClasseMasquePage();
    tailleCongelee = false;
    btnHamburger?.setAttribute('aria-expanded', 'true');
    mettreAJourIconeHamburger(false);
    recalculerDispositionVario();
    appliquerAlphaVario(); // restaure les fonds CSS hors mode masqué
}

// Lance la fenêtre flottante à l'endroit et à la taille exacts du vario affiché.
function lancerOverlay(bridge) {
    if (!varioContent) return;

    // Les réglages en cours (alpha, volume, seuils...) même non enregistrés : la fenêtre
    // flottante est une autre page, elle les relit ici.
    try {
        localStorage.setItem('SuperVario.cfgOverlay', JSON.stringify(construireConfig()));
    } catch (e) {
        console.warn('Réglages overlay non transmis :', e);
    }

    const r = varioContent.getBoundingClientRect();
    if (typeof bridge.setOverlayBounds === 'function') {
        bridge.setOverlayBounds(r.left, r.top, r.width, r.height);
    }

    // ✅ Transfert explicite de l'alpha du coloriage vers l'overlay :
    // ne dépend pas du localStorage de la WebView flottante.
    if (typeof bridge.setOverlayAlpha === 'function') {
        bridge.setOverlayAlpha(Number(sliderAlphaVario?.value ?? 100));
    }

    // false = l'écran d'autorisation s'est ouvert : on n'a pas lancé l'overlay.
    if (bridge.setOverlayEnabled(true) === false) {
        afficherInterface();
        return;
    }

    overlayLance = true;
    clearTimeout(minuterieArrierePlanOverlay);
    minuterieArrierePlanOverlay = setTimeout(() => {
        if (overlayLance && typeof bridge.moveToBackground === 'function') {
            bridge.moveToBackground();
        }
    }, 500);
}

// Retour dans l'appli (icône, ou hamburger de la fenêtre flottante) : on ferme l'overlay
// et on réaffiche l'interface. Appelée aussi par MainActivity.onResume().
function retablirDepuisOverlay() {
    if (!overlayLance) return;
    overlayLance = false;
    clearTimeout(minuterieArrierePlanOverlay);

    const bridge = pontNatif();
    if (bridge && typeof bridge.setOverlayEnabled === 'function') bridge.setOverlayEnabled(false);

    afficherInterface();
}
window.retourDepuisOverlay = retablirDepuisOverlay;

// ✅ FIX hamburger : capture AVANT toggle, application DIRECTE après.
btnHamburger?.addEventListener('click', (e) => {
    e.stopPropagation();
    terminerDrag();
    varioContainer?.classList.remove('dragging');

    const bridge = pontNatif();
    const pontOverlay = !!bridge && typeof bridge.setOverlayEnabled === 'function';

    // Dans la fenêtre flottante : le hamburger la ferme et rouvre l'application.
    if (estModeOverlay()) {
        if (pontOverlay) bridge.setOverlayEnabled(false);
        return;
    }

    const etaitMasque = appBody.classList.contains('settings-hidden');

    // Overlay déjà lancé et l'appli est revenue au premier plan : on rétablit tout.
    if (etaitMasque && overlayLance) {
        retablirDepuisOverlay();
        return;
    }

    // ✅ On capture la taille de .vario-content AVANT le toggle,
    // quand il est encore dans son contexte d'héritage normal
    // (.box-center en position:relative). C'est CETTE taille
    // qui doit être transmise au mode masqué, pas celle héritée
    // après position:fixed; inset:0.
    let tailleOrigine = null;
    if (!etaitMasque && varioContent) {
        const rect = varioContent.getBoundingClientRect();
        const z = facteurZoom || 1;
        tailleOrigine = {
            width: rect.width / z,
            height: rect.height / z
        };
    }

    appBody.classList.toggle('settings-hidden');
    const masque = appBody.classList.contains('settings-hidden');
    synchroniserClasseMasquePage();

    btnHamburger.setAttribute('aria-expanded', String(!masque));
    mettreAJourIconeHamburger(masque);

    if (masque && !etaitMasque && tailleOrigine) {
        congelerTailleVario(tailleOrigine);
    } else if (!masque) {
        tailleCongelee = false;
        recalculerDispositionVario();
    }

    // Transparence coloriage + fonds en mode masqué / restauration hors mode masqué
    appliquerAlphaVario();

    // Android : masquer l'interface = passer en fenêtre flottante.
    if (masque && !etaitMasque && pontOverlay) lancerOverlay(bridge);
});

if (estModeOverlay()) {
    // Fenêtre flottante : uniquement le contenu Vario, comme en mode masqué.
    appBody.classList.add('settings-hidden');
    synchroniserClasseMasquePage();
    mettreAJourIconeHamburger(true);

    try {
        const cfgOverlay = JSON.parse(
            localStorage.getItem('SuperVario.cfgOverlay') || localStorage.getItem('SuperVario.cfg') || 'null');
        if (cfgOverlay) appliquerConfiguration(cfgOverlay);
    } catch (e) {
        console.warn('Réglages sauvegardés illisibles :', e);
    }

    // La fenêtre a déjà la taille du vario : on ne réapplique ni largeur, ni hauteur, ni zoom.
    if (sliderLargeur) sliderLargeur.value = 100;
    if (sliderHauteur) sliderHauteur.value = 100;
    facteurZoom = 1;

    // ✅ Alpha du coloriage : la valeur passée dans l'URL par OverlayService
    // est prioritaire sur la config, puis on l'applique explicitement.
    const alphaUrl = parseInt(new URLSearchParams(location.search).get('alpha'), 10);
    if (Number.isFinite(alphaUrl) && sliderAlphaVario) {
        sliderAlphaVario.value = alphaUrl;
    }
    appliquerAlphaVario();

    appliquerTailleVario();
}

// ---------- Boucle principale ----------
function traiterEtMixer() {
    if (overlayLance) {            // la fenêtre flottante a pris le relais
        audioMonte.pause();
        audioBaisse.pause();
        sonAutoEnCours = null;
        return;
    }
    const dt = Number(sliderCadence?.value ?? 100) / 1000;
    simulationTime += dt;

    if (simulePression) {
        const cyclePression = 8;
        const dureeMonteePression = 3;
        const phase = simulationTime % cyclePression;
        const vz = phase < dureeMonteePression ? 0.5 : -0.5;
        altitudeSimulee += vz * dt;
        rawPressure = 1013.25 - altitudeSimulee * 0.12;
    }

    if (simuleAccel) {
        vitesseAccel = Math.sin(simulationTime * 2) * 0.3;   // simulation : vitesse verticale
    } else if (accelArretee || accelRefuse || !hasAccelSensor) {
        vitesseAccel = 0;                                    // pas de capteur actif : rien à intégrer
    }

    const gainP = Number(sliderP?.value ?? 1);
    const gainA = Number(sliderA?.value ?? 1);
    const ratioP = Number(sliderPartage?.value ?? 90) / 100;
    const ratioA = 1 - ratioP;

    const lissageVal = Number(sliderLissageP?.value ?? 80) / 100;
    avgPressure = avgPressure * lissageVal + rawPressure * (1 - lissageVal);
    avgAccelZ = avgAccelZ * 0.8 + rawAccelZ * 0.2;

    const diffP = (rawPressure - avgPressure) * gainP;
    const diffA = vitesseAccel * gainA;   // vitesse verticale (m/s) x « Puissance"

    if (hasPressureSensor || simulePression) pushData(pressureChart, diffP);
    if (hasAccelSensor || simuleAccel) pushData(accelChart, diffA);

    const mixResult = (-diffP * 2 * ratioP) + (diffA * ratioA);
    mixLisse = mixLisse * LISSAGE_MIX + mixResult * (1 - LISSAGE_MIX);

    jouerSonSelectionne(mixLisse);

    const needle = document.getElementById('varioNeedleImg');

    if (needle) {
        const amp = Number(sliderAmplitudeAiguille?.value ?? 30);
        const hauteurRef = varioContent?.offsetHeight || 300;
        const maxOffset = Math.max(20, hauteurRef / 2 - 10);
        const offsetY = Math.max(-maxOffset, Math.min(maxOffset, -mixLisse * amp * 5));

        needle.style.transform = `translateY(calc(-50% + ${offsetY}px))`;
    }
}

function mettreAJourAffichageCapteurs() {
    const graphP = document.getElementById('blocGraphPression');
    const graphA = document.getElementById('blocGraphAccel');
    const msgP = document.getElementById('msgPression');
    const msgA = document.getElementById('msgAccel');

    const pActive = hasPressureSensor || simulePression;
    const aActive = hasAccelSensor || simuleAccel;

    if (graphP) graphP.style.display = pActive ? '' : 'none';
    if (msgP) msgP.style.display = pActive ? 'none' : '';
    if (graphA) graphA.style.display = aActive ? '' : 'none';
    if (msgA) msgA.style.display = aActive ? 'none' : '';
}

function reinitialiserPartage() {
    const sliderMix = document.getElementById('gainPartage');
    if (!sliderMix) return;

    sliderMix.value = 90;
    sliderMix.style.setProperty('--pression', '90%');
    document.getElementById('txtPartage').textContent = '90/10';
}

// ---------- Capteurs ----------
async function demanderPermissionsCapteurs() {
    try {
        if (
            typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function'
        ) {
            await DeviceMotionEvent.requestPermission();
        }
        return true;
    } catch (erreur) {
        console.warn('Permission capteurs refusée :', erreur);
        return false;
    }
}

function appliquerTailleVario() {
    if (!varioContent) return;

    varioStack.style.transform = `scale(${facteurZoom})`;

    // ✅ Garde : si on est gelé en mode masqué, on ne touche à rien.
    if (appBody.classList.contains('settings-hidden') && tailleCongelee) {
        return;
    }

    if (dragActif) return;

    const largeur = Number(sliderLargeur?.value ?? 100);
    const hauteur = Number(sliderHauteur?.value ?? 100);

    if (!Number.isFinite(largeur) || !Number.isFinite(hauteur)) return;

    varioContent.style.width = `${largeur}%`;
    varioContent.style.height = `${hauteur}%`;
    varioContent.style.flex = '';   // ✅ restaure le flex d'origine

    if (txtLargeurVario) txtLargeurVario.textContent = `${largeur}%`;
    if (txtHauteurVario) txtHauteurVario.textContent = `${hauteur}%`;

    appliquerAlphaVario();
}

function appliquerAlphaVario() {
    const alpha = Number(sliderAlphaVario?.value ?? 100);
    const opacity = (alpha / 100).toFixed(2);
    if (coloriageVz) coloriageVz.style.opacity = opacity;
    if (txtAlphaVario) txtAlphaVario.textContent = `${alpha}%`;

    // Les fonds transparents sont gérés en CSS via html.settings-hidden-page / overlay-mode.
    // Sécurité JS : force aussi html/body en transparent avec !important (contre #0F2B4C).
    const masque = !!(appBody?.classList.contains('settings-hidden')
        || document.documentElement.classList.contains('overlay-mode'));

    if (masque) {
        document.documentElement.style.setProperty('background', 'transparent', 'important');
        document.documentElement.style.setProperty('background-color', 'transparent', 'important');
        if (appBody) {
            appBody.style.setProperty('background', 'transparent', 'important');
            appBody.style.setProperty('background-color', 'transparent', 'important');
        }
        const bridge = pontNatif();
        if (bridge && typeof bridge.setOverlayAlpha === 'function') {
            bridge.setOverlayAlpha(alpha);
        }
    } else {
        document.documentElement.style.removeProperty('background');
        document.documentElement.style.removeProperty('background-color');
        if (appBody) {
            appBody.style.removeProperty('background');
            appBody.style.removeProperty('background-color');
        }
    }
}

if (sliderLargeur) sliderLargeur.addEventListener('input', appliquerTailleVario);
if (sliderHauteur) sliderHauteur.addEventListener('input', appliquerTailleVario);
if (sliderAlphaVario) sliderAlphaVario.addEventListener('input', appliquerAlphaVario);

appliquerTailleVario();

if (sliderAmortissement && affichageAmortissement) {
    sliderAmortissement.addEventListener('input', () => {
        affichageAmortissement.textContent = `${sliderAmortissement.value}%`;
    });
}

function activerCapteurPression() {
    hasPressureSensor = true;
    mettreAJourVoyants();
    mettreAJourAffichageCapteurs();
}

function lirePressionPontNatif() {
    if (pressionArretee) return false;

    try {
        const bridge = window.SuperVarioBridge || window.AndroidBridge;
        if (!bridge) return false;

        const valeur =
            typeof bridge.getPressure === 'function' ? bridge.getPressure() :
            typeof bridge.getPressureHpa === 'function' ? bridge.getPressureHpa() :
            null;

        const hPa = Number(valeur);

        if (Number.isFinite(hPa) && hPa > 300 && hPa < 1200) {
            rawPressure = hPa;
            if (!hasPressureSensor) activerCapteurPression();
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

async function initialiserCapteursReels() {
    await demanderPermissionsCapteurs();

    if ('Barometer' in window) {
        try {
            const barometer = new Barometer({ frequency: 10 });
            barometer.addEventListener('reading', () => {
                if (pressionArretee) return;

                if (typeof barometer.pressure === 'number' && !Number.isNaN(barometer.pressure)) {
                    rawPressure = barometer.pressure;
                    if (!hasPressureSensor) activerCapteurPression();
                }
            });
            barometer.start();
        } catch (err) {
            console.warn('Baromètre API native en erreur :', err);
        }
    }

    if (window.cordova?.plugins?.barometer) {
        try {
            window.cordova.plugins.barometer.watch(
                (hPa) => {
                    if (pressionArretee) return;
                    rawPressure = Number(hPa);
                    if (!hasPressureSensor) activerCapteurPression();
                },
                (err) => console.warn('Plugin baromètre en erreur :', err)
            );
        } catch (err) {
            console.warn('Plugin baromètre indisponible :', err);
        }
    }

    setInterval(() => lirePressionPontNatif(), 200);
    lirePressionPontNatif();
}

// ---------- Pinch / drag ----------
function distanceEntrePoints(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

if (varioContainer) {
    varioContainer.addEventListener('dragstart', (e) => e.preventDefault());
}

// ✅ Pas de menu contextuel sur la zone de drag.
visualDisplay?.addEventListener('contextmenu', (e) => e.preventDefault());

// ✅ Fonction unique de fin de drag, appelable depuis n'importe où.
function terminerDrag() {
    if (!dragActif) {
        longPressTimer && clearTimeout(longPressTimer);
        longPressTimer = null;
        pointers.clear();
        varioContainer?.classList.remove('dragging');
        return;
    }

    dragActif = false;

    longPressTimer && clearTimeout(longPressTimer);
    longPressTimer = null;

    varioContainer?.classList.remove('dragging');
    pointers.clear();
}

// ✅ Filet de sécurité global — peu importe où/comment le pointeur
// se relâche, on termine le drag.
window.addEventListener('pointerup', terminerDrag, { passive: true });
window.addEventListener('pointercancel', terminerDrag, { passive: true });
window.addEventListener('touchend', terminerDrag, { passive: true });
window.addEventListener('touchcancel', terminerDrag, { passive: true });
window.addEventListener('blur', terminerDrag);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) terminerDrag();
});

if (visualDisplay) {
    visualDisplay.addEventListener('pointerdown', (e) => {
        // ✅ FIX CRITIQUE : ne pas interférer avec le hamburger.
        if (e.target.closest('#btnHamburger')) return;

        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // ✅ Capture du pointeur APRÈS la garde hamburger.
        try { visualDisplay.setPointerCapture(e.pointerId); } catch (_) {}

        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchStartDist = distanceEntrePoints(a, b);
            pinchStartZoom = facteurZoom;
            return;
        }

        if (pointers.size !== 1) return;

        const estSouris = e.pointerType === 'mouse';
        const estClicDroit = estSouris && e.button === 2;
        const estClicGauche = estSouris && e.button === 0;

        if (estSouris && !estClicDroit && !estClicGauche) return;

        dragStartX = e.clientX;
        dragStartY = e.clientY;

        clearTimeout(longPressTimer);
        longPressTimer = null;

        const preparerDrag = () => {
            if (dragActif) terminerDrag();

            dragActif = true;
            varioContainer?.classList.add('dragging');

            const rect = varioContainer.getBoundingClientRect();
            varioStartX = rect.left;
            varioStartY = rect.top;

            varioContainer.style.position = 'fixed';
            varioContainer.style.left = `${rect.left}px`;
            varioContainer.style.top = `${rect.top}px`;
            varioContainer.style.transform = 'none';
            varioContainer.style.width = `${rect.width}px`;
            varioContainer.style.height = `${rect.height}px`;
        };

        if (estClicDroit) {
            e.preventDefault();
            preparerDrag();
            return;
        }

        if (estClicGauche) {
            preparerDrag();
            return;
        }

        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            preparerDrag();
        }, 400);
    }, { passive: false });
}

document.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (longPressTimer && !dragActif) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    if (pointers.size === 2 && pinchStartDist > 0) {
        const [a, b] = [...pointers.values()];
        const ratio = distanceEntrePoints(a, b) / pinchStartDist;

        facteurZoom = Math.max(0.3, Math.min(3, pinchStartZoom * ratio));
        appliquerTailleVario();
        return;
    }

    if (dragActif && varioContainer) {
        e.preventDefault();
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        varioContainer.style.left = `${varioStartX + dx}px`;
        varioContainer.style.top = `${varioStartY + dy}px`;
    }
}, { passive: false });

const endPointer = (e) => {
    pointers.delete(e.pointerId);

    if (pointers.size < 2) pinchStartDist = 0;

    if (pointers.size === 0) {
        clearTimeout(longPressTimer);
        longPressTimer = null;

        if (dragActif) {
            dragActif = false;
            varioContainer?.classList.remove('dragging');
        }
    }
};

document.addEventListener('pointerup', endPointer, { passive: true });
document.addEventListener('pointercancel', endPointer, { passive: true });

// ---------- Initialisation ----------
accelRefuse = lireRefusAccel();
if (!accelRefuse) demarrerEcouteAccel();
initialiserCapteursReels();
mettreAJourVoyants();
mettreAJourAffichageCapteurs();

loopInterval = setInterval(
    traiterEtMixer,
    Number(sliderCadence?.value ?? 100)
);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

});

// ---------- Mode overlay (fenêtre flottante Android) ----------
const paramsUrl = new URLSearchParams(location.search);
if (paramsUrl.get('mode') === 'overlay') {
    document.documentElement.classList.add('overlay-mode');
    // Test « transparence » (OVERLAY_TRANSPARENT = true dans OverlayService.kt)
    if (paramsUrl.get('fond') === 'transparent') {
        document.documentElement.classList.add('overlay-transparent');
    }
}
