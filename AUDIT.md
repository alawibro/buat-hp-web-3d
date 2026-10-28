# Audit Tahap 4 — Biodata + Stage 3D Bintang Zero

## Hasil audit otomatis (`npm run audit`)

Viewport: HP 360×740, HP 390×844, HP landscape 844×390, tablet 768×1024, laptop 1366×768, desktop 1920×1080. Semua 12 tab diperiksa di tiap viewport.

| Pemeriksaan | Hasil |
|---|---|
| Stage 3D siap (model tampil) | Ya, di semua viewport |
| Halaman bisa digeser horizontal | Tidak (0 px) |
| Elemen konten keluar viewport | 0 |
| Kontras teks (WCAG AA) | 0 pelanggaran |
| Target sentuh ≥ 44×44 px | Terpenuhi |
| CLS | 0 di HP 360/390; ≤ 0,003 di layar lain |
| Fokus keyboard terlihat | Ya (termasuk stage 3D) |
| Panah kiri/kanan pindah tab | Ya |
| Tombol & tautan punya nama aksesibel | Ya |
| Gambar & model punya alt | Ya |
| Id ganda / atribut lang | Tidak ada / `id` |
| Mode "kurangi gerakan" | Gelembung mati, auto-rotate mati |
| GLB tidak ditemukan | Status error tampil, halaman tetap bisa dipakai |

## Perbaikan yang dihasilkan audit

1. Latar dekoratif memperlebar area scroll → dibungkus `.deco` dengan `contain: paint`.
2. Teks muted terlalu redup di latar biru → `--text-muted` dinaikkan ke `#bccbef`.
3. Nama hero pink terlalu redup di tengah latar → `--pink-soft: #ff7de4`.
4. Teks kartu Anime terlalu transparan → tinta penuh.
5. Caption stage terlalu redup di atas kaca → `--text`.
6. Tombol ↑ bisa difokus saat tersembunyi → `visibility: hidden`.
7. Fokus masuk ke dalam `model-viewer` tanpa sorotan → sorotan di bingkai stage (`:focus-within`).
8. Tagline mengetik melompat tinggi di HP → ruang dua baris (`min-height: 2lh`) di layar < 720 px.
9. Target sentuh < 44 px (tab, tombol ↑, tombol salin ID) → diperbesar.

## Yang perlu dicek manual (tidak bisa diotomatisasi)

- **Perangkat asli:** iPhone Safari dan Android Chrome. Geser vertikal di stage harus menggulir halaman; geser horizontal memutar model.
- **Performa 60 fps:** DevTools → Performance → rekam saat auto-rotate. Headless tidak bisa mengukur FPS GPU sungguhan.
- **Dua konteks WebGL** (latar 3D + model soda) di HP kelas menengah: pantau memori dan frame.
- **Lighthouse (mobile):** `npx lighthouse http://localhost:8080 --preset=perf --view`. Target LCP < 2,5 dtk, CLS < 0,1.
- **Reflow 320 px / zoom 400%** (WCAG 1.4.10): belum diuji otomatis.
- **Screen reader:** TalkBack / VoiceOver membaca caption stage dan tombol salin ID.
- **Font Google:** tes offline memakai fallback, jadi pergantian font belum teruji.
- **CDN asli:** jalankan `npm run audit:live` untuk menguji unpkg dan gstatic yang sebenarnya.

## Cara menjalankan

```
npm install
npx playwright install chromium
npm run audit        # CDN di-mock dengan file lokal
npm run audit:live   # CDN asli
```

Hasil: `audit-report/REPORT.md` dan `audit-report/screens/*.png`. Exit code 1 jika ada FAIL.
