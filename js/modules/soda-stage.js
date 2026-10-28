/* ==========================================================
   soda-stage.js
   Logika untuk stage model 3D Bintang Zero di Beranda.

   - Auto-rotate aktif, kecuali jika "kurangi gerakan" dinyalakan.
     Setelah pengguna memutar sendiri, rotasi berhenti dan lanjut
     lagi otomatis (diatur atribut auto-rotate-delay di HTML).
   - Progres unduhan ditampilkan di caption (diperbarui tiap 10%
     agar pembaca layar tidak kebanjiran pengumuman).
   - Jika model gagal dimuat, stage menampilkan pesan dan poster
     tetap terlihat. Halaman tetap berfungsi.
   - Di HP, model dimuat saat mendekati layar, agar tidak menghabiskan
     data untuk bagian yang belum terlihat.
   ========================================================== */
(() => {
  'use strict';
  const App = window.App;

  const MOBILE_QUERY = '(max-width: 719px)';
  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

  const TEXT = {
    loading: 'Memuat model 3D…',
    ready: 'Geser untuk memutar ↻',
    error: 'Model 3D gagal dimuat. Muat ulang halaman untuk mencoba lagi.',
  };

  // Batas waktu sejak unduhan dimulai. Jika lewat, dianggap gagal
  // (mencegah caption macet di "100%" bila proses parse gagal diam-diam).
  const LOAD_TIMEOUT_MS = 30000;

  App.initSodaStage = () => {
    const stage = document.querySelector('.soda-stage');
    const viewer = document.querySelector('.soda-stage__model');
    const caption = document.getElementById('sodaCaption');
    if (!stage || !viewer || !caption) return;

    // Sumber model: data base64 (berfungsi juga dari file://), atau file .glb (jika skrip data tidak ada)
    const modelSrc = () => {
      if (!window.SODA_GLB_BASE64) return 'assets/3d/bintang-1.glb';
      const bin = atob(window.SODA_GLB_BASE64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    };
    viewer.setAttribute('src', modelSrc());

    // Jika script model-viewer tidak termuat (mis. CDN diblokir), caption tidak boleh macet
    setTimeout(() => {
      if (!window.customElements || !customElements.get('model-viewer')) {
        stage.classList.add('is-error');
        caption.setAttribute('role', 'status');
        caption.textContent = TEXT.error;
        console.warn('[soda-stage] komponen model-viewer belum termuat');
      }
    }, 15000);

    // Di HP, tunda pemuatan model sampai stage mendekati layar
    if (window.matchMedia(MOBILE_QUERY).matches) {
      viewer.setAttribute('loading', 'lazy');
    }

    // Gerakan otomatis hanya untuk pengguna yang tidak meminta pengurangan gerakan
    const reduced = window.matchMedia(REDUCED_QUERY);
    const applyMotionPreference = () => {
      if (reduced.matches) viewer.removeAttribute('auto-rotate');
      else viewer.setAttribute('auto-rotate', '');
    };
    applyMotionPreference();
    reduced.addEventListener('change', applyMotionPreference);

    caption.textContent = TEXT.loading;

    let finished = false;
    let watchdog = null;

    const showError = (reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      stage.classList.remove('is-ready');
      stage.classList.add('is-error');
      caption.setAttribute('role', 'status');
      caption.textContent = TEXT.error;
      // Detail teknis hanya untuk pengembang, tidak ditampilkan ke pengunjung
      console.warn('[soda-stage] gagal memuat model:', reason);
    };

    // Progres: perbarui tampilan hanya setiap kelipatan 10%.
    // Watchdog dinyalakan saat unduhan pertama kali dimulai, bukan saat
    // init, supaya model di HP yang dimuat lazy tidak dianggap macet.
    let lastStep = -1;
    viewer.addEventListener('progress', (event) => {
      if (finished) return;
      if (watchdog === null) {
        watchdog = setTimeout(() => showError('timeout'), LOAD_TIMEOUT_MS);
      }
      const total = (event.detail && event.detail.totalProgress) || 0;
      const pct = Math.round(total * 100);
      const step = Math.floor(pct / 10);
      if (step === lastStep) return;
      lastStep = step;
      caption.textContent = `${TEXT.loading} ${pct}%`;
    });

    viewer.addEventListener('load', () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      stage.classList.remove('is-error');
      stage.classList.add('is-ready');
      caption.textContent = TEXT.ready;
    });

    viewer.addEventListener('error', (event) => showError(event.detail));
  };
})();
