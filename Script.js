document.addEventListener('DOMContentLoaded', () => {

  let rawPressure = 1013.25;
  let rawAccelZ = 0;
  let simulationTime = 0;
  let altitudeSimulee = 0;
  let vitesseVerticaleSimulee = 0;
  let avgPressure = 1013.25;
  let avgAccelZ = 0;
  let loopInterval = null;
  let pressureObserver = null;
  let mixLisse = 0;
  let hasPressureSensor = false;
  let hasAccelSensor = false;

  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;
  let nextBeepTime = 0;

  const sliderP = document.getElementById('gainPressure');
  const sliderA = document.getElementById('gainAccel');
  const sliderCadence = document.getElementById('gainCadence');
  const sliderPartage = document.getElementById('gainPartage');
  const sliderVolume = document.getElementById('gainVolume');
  const sliderSeuilMonte = document.getElementById('seuilMonte');
  const sliderSeuilBaisse = document.getElementById('seuilBaisse');
  const sliderAmplitudeAiguille = document.getElementById('amplitudeAiguille');
  const sliderTaille = document.getElementById('tailleVario');
  const varioContent = document.querySelector('.vario-content');

  if (sliderTaille && varioContent) {
    sliderTaille.addEventListener('input', (e) => {
      const scale = e.target.value / 100;
      varioContent.style.transform = `scale(${scale})`;
      document.getElementById('txtTailleVario').textContent = `${e.target.value}%`;
    });
  }

  function initAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
      oscillator = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0;

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function jouerSonVario(mixValue) {
    if (!audioCtx || !gainNode || !oscillator) return;

    const volume = Number(sliderVolume.value) / 100;
    const now = audioCtx.currentTime;
    const seuilMonte = Number(sliderSeuilMonte.value);
    const seuilBaisse = Number(sliderSeuilBaisse.value);

    if (volume === 0) {
      gainNode.gain.setValueAtTime(0, now);
      return;
    }

    if (mixValue > seuilMonte) {
      const freq = Math.min(1600, 500 + mixValue * 250);
      oscillator.frequency.setValueAtTime(freq, now);

      const beepDuration = Math.max(0.08, 0.3 - mixValue * 0.04);
      const beepInterval = Math.max(0.12, 0.5 - mixValue * 0.06);

      if (now >= nextBeepTime) {
        gainNode.gain.setValueAtTime(volume * 0.3, now);
        gainNode.gain.setValueAtTime(0, now + beepDuration);
        nextBeepTime = now + beepInterval;
      }
    } else if (mixValue < -seuilBaisse) {
      const freq = Math.max(180, 350 + mixValue * 80);
      oscillator.frequency.setValueAtTime(freq, now);
      gainNode.gain.setValueAtTime(volume * 0.25, now);
    } else {
      gainNode.gain.setValueAtTime(0, now);
    }
  }
  function testerSonMonte() {
  initAudio();

  if (!audioCtx || !gainNode || !oscillator) return;

  const volume = Number(sliderVolume.value) / 100;
  const now = audioCtx.currentTime;

  if (volume === 0) {
    gainNode.gain.setValueAtTime(0, now);
    return;
  }

  // Son de montée : aigu et bref
  oscillator.frequency.setValueAtTime(1200, now);
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(volume * 0.3, now);
  gainNode.gain.setValueAtTime(0, now + 0.25);

  nextBeepTime = now + 0.3;
  jouerSonVario(3.0); // simule une montée de 3 m/s
}

function testerSonBaisse() {
  initAudio();

  if (!audioCtx || !gainNode || !oscillator) return;

  const volume = Number(sliderVolume.value) / 100;
  const now = audioCtx.currentTime;

  if (volume === 0) {
    gainNode.gain.setValueAtTime(0, now);
    return;
  }

  // Son de descente : grave et continu bref
  oscillator.frequency.setValueAtTime(300, now);
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(volume * 0.25, now);
  gainNode.gain.setValueAtTime(0, now + 0.5);

  nextBeepTime = now + 0.6;
  jouerSonVario(-3.0); // simule une descente de -3 m/s 
  
}

const btnTestMonte = document.getElementById('btnTestMonte');
const btnTestBaisse = document.getElementById('btnTestBaisse');

if (btnTestMonte) {
  btnTestMonte.addEventListener('click', testerSonMonte);
}

if (btnTestBaisse) {
  btnTestBaisse.addEventListener('click', testerSonBaisse);
}

  function creerGraphique(canvasId, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: Array(30).fill(''),
        datasets: [{
          label,
          data: Array(30).fill(null),
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { display: false },
          y: {
            grid: { color: '#2a2a2a' },
            ticks: { color: '#aaa', font: { size: 9 } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  const pressureChart = creerGraphique('pressureChart', 'Pression', '#00e676');
  const accelChart = creerGraphique('accelChart', 'Accélération', '#ff9800');

  function pushData(chart, value) {
    if (!chart) return;
    const data = chart.data.datasets[0].data;
    data.shift();
    data.push(Number(value));
    chart.update('none');
  }

  if (sliderP) {
    sliderP.addEventListener('input', (e) => {
      document.getElementById('txtGainPressure').textContent = e.target.value + 'x';
    });
  }

  if (sliderA) {
    sliderA.addEventListener('input', (e) => {
      document.getElementById('txtGainAccel').textContent = e.target.value + 'x';
    });
  }

  if (sliderVolume) {
    sliderVolume.addEventListener('input', (e) => {
      document.getElementById('txtVolume').textContent = e.target.value + '%';
    });
  }

  if (sliderSeuilMonte) {
    sliderSeuilMonte.addEventListener('input', (e) => {
      document.getElementById('txtSeuilMonte').textContent = `${Number(e.target.value).toFixed(1)} m/s`;
    });
  }

  if (sliderSeuilBaisse) {
    sliderSeuilBaisse.addEventListener('input', (e) => {
      document.getElementById('txtSeuilBaisse').textContent = `${Number(e.target.value).toFixed(1)} m/s`;
    });
  }

  if (sliderPartage) {
    sliderPartage.addEventListener('input', (e) => {
      const value = Number(e.target.value);
      document.getElementById('txtPartage').textContent = `${value}/${100 - value}`;
      e.target.style.setProperty('--pression', `${value}%`);
    });
  }

  if (sliderCadence) {
    sliderCadence.addEventListener('input', (e) => {
      const ms = Number(e.target.value);
      document.getElementById('txtCadence').textContent = ms + ' ms';
      if (loopInterval !== null) {
        clearInterval(loopInterval);
        loopInterval = setInterval(traiterEtMixer, ms);
      }
    });
  }
if (sliderAmplitudeAiguille) {
  sliderAmplitudeAiguille.addEventListener('input', (e) => {
    document.getElementById('txtAmplitudeAiguille').textContent = e.target.value;
  });
}
  const btnHamburger = document.getElementById('btnHamburger');
  if (btnHamburger) {
    btnHamburger.addEventListener('click', () => {
      const mainHeader = document.getElementById('mainHeader');
      const headerTitle = document.getElementById('headerTitle');
      const outerBoxes = document.querySelectorAll('.box-outer');
      const toggleableBtns = document.querySelectorAll('.btn-toggleable');

      if (mainHeader) mainHeader.classList.toggle('header-masque');
      if (headerTitle) headerTitle.classList.toggle('masque-element');

      toggleableBtns.forEach(btn => btn.classList.toggle('masque-element'));
      outerBoxes.forEach(box => box.classList.toggle('masque-element'));
    });
  }
  
function traiterEtMixer() {
if (!hasPressureSensor || !hasAccelSensor) {
    const dt = Number(sliderCadence.value) / 1000;
    simulationTime += dt;

    // Scénario cyclique de 32 secondes
    const phase = simulationTime % 32;

    if (phase < 7) {
        // Montée progressive : +0,4 à +2,0 m/s
        vitesseVerticaleSimulee = 0.4 + phase * 0.23;

    } else if (phase < 12) {
        // Montée irrégulière : simulation d'un thermique
        vitesseVerticaleSimulee =
            1.3 +
            Math.sin(phase * 3.2) * 0.45;

    } else if (phase < 16) {
        // Zone calme, proche de zéro
        vitesseVerticaleSimulee =
            Math.sin(phase * 2.5) * 0.12;

    } else if (phase < 23) {
        // Descente progressive : -0,5 à -2,0 m/s
        vitesseVerticaleSimulee =
            -0.5 - (phase - 16) * 0.22;

    } else if (phase < 27) {
        // Descente turbulente
        vitesseVerticaleSimulee =
            -1.25 +
            Math.sin(phase * 3.5) * 0.35;

    } else {
        // Retour vers une faible montée
        vitesseVerticaleSimulee =
            0.35 +
            Math.sin(phase * 2.2) * 0.25;
    }

    // Altitude intégrée à partir de la vitesse verticale
    altitudeSimulee += vitesseVerticaleSimulee * dt;

    // Approximation près du niveau de la mer :
    // la pression diminue d'environ 0,12 hPa par mètre de montée.
    const bruitPression = (Math.random() - 0.5) * 0.025;
    rawPressure = 1013.25 - altitudeSimulee * 0.12 + bruitPression;

    // L'accéléromètre mesure surtout les changements de vitesse,
    // avec une petite turbulence, pas directement la vitesse verticale.
    const turbulence =
        Math.sin(simulationTime * 8) * 0.10 +
        (Math.random() - 0.5) * 0.08;

    rawAccelZ =
        Math.sin(simulationTime * 2.2) * 0.08 +
        turbulence;
}

    const gainP = Number(sliderP.value);
    const gainA = Number(sliderA.value);
    const ratioP = Number(sliderPartage.value) / 100;
    const ratioA = 1 - ratioP;

    avgPressure = avgPressure * 0.8 + rawPressure * 0.2;
    avgAccelZ = avgAccelZ * 0.8 + rawAccelZ * 0.2;

    const diffPressure = (rawPressure - avgPressure) * gainP;
    const diffAccel = (rawAccelZ - avgAccelZ) * gainA;

    pushData(pressureChart, (avgPressure + diffPressure) - 1013.25);
    pushData(accelChart, diffAccel);

    const mixResult = (-diffPressure * 2 * ratioP) + (diffAccel * ratioA);
const alphaMix = 0.25;
mixLisse = mixLisse * (1 - alphaMix) + mixResult * alphaMix;
    // Mouvement vertical de l'aiguille seul
    const needle = document.getElementById('varioNeedleImg');
    if (needle) {
      const maxOffset = 150; 
 const amplitudeAiguille = Number(sliderAmplitudeAiguille.value);
const offsetY = Math.max(-maxOffset, Math.min(maxOffset, -mixLisse * amplitudeAiguille));
      needle.style.transform = `translateY(calc(-50% + ${offsetY}px))`;
    }

jouerSonVario(mixLisse);
  }

  function demarrerCapteurs() {
    initAudio();

    if ('PressureObserver' in window) {
      try {
        pressureObserver = new PressureObserver((records) => {
          if (records.length > 0) {
            rawPressure = records[records.length - 1].pressure;
            hasPressureSensor = true;
          }
        });
        pressureObserver.observe('cpu');
      } catch (error) {
        console.error('Erreur du capteur de pression :', error);
      }
    }

    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', (event) => {
        const acceleration = event.accelerationIncludingGravity;
        if (acceleration && acceleration.z !== null) {
          rawAccelZ = acceleration.z - 9.81;
          hasAccelSensor = true;
        }
      });
    }

    loopInterval = setInterval(traiterEtMixer, Number(sliderCadence.value));
  }

  let isRunning = false;
  const btnStart = document.getElementById('btnStart');

  if (btnStart) {
    btnStart.addEventListener('click', () => {
      if (!isRunning) {
        demarrerCapteurs();
        btnStart.textContent = "Arrêter";
        btnStart.classList.add('active');
        isRunning = true;
      } else {
        if (loopInterval) clearInterval(loopInterval);
        if (audioCtx) audioCtx.suspend();
        btnStart.textContent = "Marche / Arrêt";
        btnStart.classList.remove('active');
        isRunning = false;
      }
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((error) => {
        console.error('Erreur du service worker :', error);
      });
    });
  }

});
