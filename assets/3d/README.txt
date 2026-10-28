Isi folder ini:

  bintang-1.js           Model Bintang Zero (625 KB, Draco) dalam base64.
                         Dipakai agar halaman berfungsi saat index.html dibuka langsung
                         dari file (klik dua kali), karena browser memblokir fetch file lokal.
  bintang-1.glb          Sama dengan di atas dalam bentuk file biasa. Dipakai hanya jika
                         bintang-1.js tidak ada (mis. di server HTTP).
  bintang-1-card.webp    Poster yang tampil sebelum model selesai dimuat (159 KB).

Jika salah satu file model diubah, buat ulang bintang-1.js dengan base64 dari bintang-1.glb.
Decoder Draco diambil otomatis dari gstatic.com, jadi butuh koneksi internet.
