# SEA Crossing Line — Atlas Kereta Api

SEA Crossing Line adalah atlas peta interaktif untuk menelusuri jaringan kereta api 11 negara Asia Tenggara lintas masa. Peta membedakan jalur aktif, nonaktif, rencana reaktivasi, dan jalur tua. Data rel berasal dari OpenStreetMap, tahunnya dari tag OSM, Wikidata, dan Wikipedia, bukan survei resmi atau rekonstruksi arsip. Linimasa hanya menampilkan yang punya bukti tahun. Tahun buka mencakup 66% panjang jalur aktif, dan sisanya hanya tampil di 2026 ([catatan QA](docs/DATA_QA.md)). Lapisan reaktivasi hanya untuk Jawa dan baru memuat 5 dari 13 jalur ([sumber](docs/reactivation_sources.md)).

## Data dan skema

Semua berkas berada di `public/data/` sebagai GeoJSON `FeatureCollection` dengan koordinat EPSG:4326, dalam urutan `[longitude, latitude]`.

- `land.geojson`: `MultiPolygon` 11 negara Asia Tenggara dari Natural Earth 10m, disederhanakan.
- `rail_active.geojson`: `LineString` dengan `name`, `operator`, dan opsional `opened_year` beserta `opened_year_source`.
- `rail_disused.geojson`: `LineString` dengan `name`, `status` (`disused` atau `abandoned`), serta opsional `opened_year` dan `closed_year` beserta sumbernya.
- `reactivation.geojson`: `LineString` dengan `name`, `stage` (`rencana`, `proses`, atau `selesai`), `length_km`, opsional `source_url`, `source_year`, dan `target_year`.
- `colonial.geojson`: `LineString` dengan `name`, `year_built` (sampai 1941), dan `year_source`.
- `stations.geojson`, `volcanoes.geojson`: `Point` dari OSM dengan `name`, plus `kind` (`station`, `halt`) dan `opened_year` opsional, atau `ele` opsional. Nama modern. Stasiun tanpa tahun sendiri memakai tahun buka jalur tempatnya berdiri (`opened_year_basis: line`), dan tanpa itu hanya tampil di 2026.
- `neighbors.geojson`, `bathymetry.geojson`: `MultiPolygon` dari Natural Earth untuk daratan sekitar dan pita kedalaman laut (`depth`). `borders.geojson` dan `cities.geojson` juga dari Natural Earth.
- `meta.json`: `sample`, tanggal `updated`, dan daftar `sources`. Set `sample` menjadi `false` setelah seluruh data contoh diganti untuk menghilangkan cap data contoh.

File diperiksa saat dibuka. Koleksi yang salah format menampilkan catatan kesalahan; fitur dengan geometri atau properti yang tidak valid dilewati dan dicatat di konsol. Panjang yang terlihat di buku jarak dihitung dari geometri jalur dan merupakan perkiraan.

### Mengganti GeoJSON

1. Ganti isi file sesuai nama dan bentuk skema di atas; pertahankan nama file atau ubah pemetaan file di `src/components/atlas/atlas-data.ts`.
2. Pastikan geometri jalur berupa `LineString` dengan sedikitnya dua titik, dan daratan berupa `Polygon`.
3. Isi `sources` dengan rujukan sebenarnya, catat atribusi/lisensi, lalu perbarui `updated`.
4. Jika memakai OpenStreetMap, pertahankan atribusi kontributor dan penuhi lisensi ODbL. Jangan menggambarkan data ilustratif sebagai data arsip.

## Pipeline data

Unduhan mentah masuk ke `data-raw/` (tidak masuk git), dan hasil olahan masuk ke `public/data/`. Jalankan dari root repo, berurutan:

```sh
bun run data:fetch                     # unduh OSM lewat Overpass; berkas yang sudah ada dilewati
bun run data:build                     # tulis rail_active dan rail_disused; menghapus closed_year
node scripts/enrich-closed-year.mjs    # closed_year dari Wikipedia, hasilnya di data-raw/work/
cp data-raw/work/rail_disused.dated.geojson public/data/rail_disused.geojson
node scripts/enrich-time-osm.mjs       # closed_year dari tag OSM, plus tabel di docs/DATA_QA.md
python -I scripts/route-between.py     # reactivation.geojson; butuh pip install networkx shapely
python -I scripts/build-land.py        # land.geojson: 11 negara Asia Tenggara (Natural Earth)
python -I scripts/build-context.py     # neighbors, bathymetry, borders, cities (Natural Earth)
cp public/data/rail_active.geojson public/data/rail_disused.geojson data-raw/java-baseline/  # sekali, sebagai dasar Jawa
bun run data:sea                       # unduh Asia Tenggara, ambil tahun, tulis rel, stasiun, gunung api, dan lapisan jalur tua
bun run data:qa                        # gagal jika ada fitur yang ditolak validator
bun run test && bun run build
```

Empat hal yang perlu kamu perhatikan saat menjalankan ulang:

- Satu `closed_year` diisi manual dari artikel yang dikutip (lihat `meta.json`). Isi lagi setelah `enrich-closed-year.mjs`.
- Daftar jalur dan panjang reaktivasi ada di `scripts/reactivation-lines.json`. Jalur yang belum terselesaikan tercatat di `docs/reactivation_sources.md`.
- Hasil Overpass bisa berubah antarunduhan, jadi periksa lagi jumlah fitur dan `docs/DATA_QA.md`.
- Peta nama jalur ke halaman Wikipedia ada di `scripts/line-pages.json`, dan aturan review tahun ada di `scripts/build-line-years.mjs`.

## Lisensi data

Data OpenStreetMap yang sudah diolah di `public/data/` merupakan basis data turunan. Jika kamu memublikasikan GeoJSON ini, data tersebut harus tetap berlisensi ODbL, dengan atribusi kepada kontributor OpenStreetMap dan syarat berbagi serupa. Baca [halaman lisensi OpenStreetMap](https://www.openstreetmap.org/copyright). Tahun yang berasal dari Wikipedia berlisensi CC BY-SA 4.0, dan dari Wikidata CC0. Bagian ini bukan nasihat hukum.

## Menjalankan

```sh
bun install
bun run dev
```

Jalankan pemeriksaan otomatis dengan `bun run test`. Lovable mengelola pratinjau dan publikasi dari editor.

## Penerapan statis dan GitHub Pages

Aplikasi ini menggunakan TanStack Start dengan target server Cloudflare milik template Lovable. Build standar tidak otomatis merupakan situs statis GitHub Pages. Untuk GitHub Pages, aktifkan konfigurasi prerender/static yang sesuai dengan versi TanStack Start target, set base path repositori pada konfigurasi build, lalu deploy direktori statis yang dihasilkan. Data publik dimuat relatif terhadap `import.meta.env.BASE_URL` agar dapat mengikuti base path. Verifikasi keluaran build dan rute `/` di GitHub Pages sebelum beralih ke produksi. Untuk Lovable, gunakan tombol **Publish** pada editor.