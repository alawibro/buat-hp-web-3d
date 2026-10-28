# web-avatar — Biodata M. Baihaqi Alawi

Redesign tema **Nebula Refined** (Opsi A). Teks biodata tidak diubah.

## Cara menjalankan

Buka `index.html` langsung di browser. Tidak perlu server, karena semua skrip memakai script klasik.

Jika three.js dari CDN tidak bisa dimuat, halaman otomatis memakai CDN cadangan. Jika keduanya gagal, latar 3D dilewati dan halaman tetap berfungsi.

## Struktur

```
index.html
css/
  tokens.css       warna, tipografi, jarak, bayangan, z-index
  base.css         reset, fokus, pengaturan reduced motion
  layout.css       navigasi, kontainer, hero, avatar
  components.css   kartu, label, tombol, status, modal, toast
  pages.css        grid dan kartu khusus tiap halaman
  fx.css           latar, nebula, kilat, pecahan, teks bergerak, confetti
js/
  data.js          teks tagline, pesan avatar, kutipan, status per jam
  vendor-loader.js memuat three.js (CDN utama lalu cadangan)
  utils.js         namespace App, toast, confetti
  main.js          titik masuk
  modules/
    nav.js         tab ARIA, panah keyboard, sinkron hash
    hero.js        status jam, efek ketik tagline
    roll.js        kutipan acak
    avatar.js      avatar, efek suara pop, pesan
    copy-id.js     salin ID Free Fire
    modal.js       modal rahasia (Konami), fokus dan Esc
    scroll.js      progress bar dan tombol ke atas
    visit.js       penghitung kunjungan
    tilt.js        kartu Beranda yang miring mengikuti kursor
    reveal-text.js animasi huruf dan kata di Beranda
    sky.js         latar langit 2D (canvas)
    scene-3d.js    latar 3D (three.js)
assets/img/
  avatar.jpg, nebula.jpg, school.jpg
```

## Mengubah kepadatan latar 3D

Buka `js/modules/scene-3d.js` dan ubah angka di `COUNTS`. Angka yang lebih kecil membuat halaman lebih ringan.

## Catatan

- Teks yang terlihat dan string data JS sudah diverifikasi identik dengan versi asli.
- Musik latar dan sapaan suara otomatis sudah dihapus sesuai keputusan.
