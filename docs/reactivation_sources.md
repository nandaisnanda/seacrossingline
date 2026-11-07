# Reactivation sources

Sources and decisions behind `public/data/reactivation.geojson`. Checked 2026-11-06. Rebuild with `python -I scripts/route-between.py` (needs `networkx` and `shapely`); inputs are in `scripts/reactivation-lines.json`.

## Source access

The two requested Bisnis.com articles returned HTTP 403, so nobody read their text for this file:

- https://ekonomi.bisnis.com/read/20250930/98/1916069/daftar-13-jalur-kereta-yang-akan-direaktivasi-djka-kemenhub
- https://ekonomi.bisnis.com/read/20250930/98/1916031/pemerintah-mau-reaktivasi-jalur-kereta-api-mati-anggaran-siap

The list below comes from outlets that were read directly. All of them attribute it to DJKA Kemenhub and Ripnas. Compare against Bisnis.com if you can open those pages.

| Outlet | Published | URL |
| --- | --- | --- |
| InvestorTrust (cited in the GeoJSON) | 2025-09-30 | https://investortrust.id/business/80596/jalur-ka-tidur-2233-km-masuk-rencana-reaktivasi-anggaran-siap |
| Warta Bogor (credits CNBC Indonesia) | 2025-09-29 | https://wartabogor.id/daftar-jalur-ka-yang-masuk-rencana-reaktivasi-hingga-tahun-2030/ |
| Harian Jogja | 2025-10-05 | https://jogjapolitan.harianjogja.com/r-1230358/pemerintah-akan-hidupkan-lagi-13-jalur-kereta-mati-di-jawa |
| ANTARA Jawa Timur | 2025-10-07 | https://jatim.antaranews.com/berita/985457/pemkab-ponorogo-apresiasi-positif-rencana-kemenhub-aktifkan-jalur-ka |
| PDI Perjuangan Jawa Timur | 2025-10-11 | https://pdiperjuangan-jatim.com/bupati-sugiri-sambut-baik-ripnas-reaktivasi-13-jalur-kereta-api-di-pulau-jawa/ |

## The 13 lines

All 13 names are covered, drawn as 12 lines. "Stated length" lists the figure the route was checked against. A route passes within 30% of it.

| Line | Stated length (source, year) | Routed km | Note |
| --- | --- | --- | --- |
| Sukabumi–Cianjur–Padalarang | 40 km, Cianjur–Padalarang only ([detik][detik18], 2018) | 82.8 (checked part 44.3) | See scope below |
| Cicalengka–Jatinangor–Tanjungsari | 11.2 km, Rancaekek–Tanjungsari only ([Wikipedia][wpr], 2026) | 20.2 (checked part 11.1) | Reaches the branch over 9.1 km of active track |
| Cirebon–Kadipaten | 47 km ([detik][detik], 2017); 48.6 km ([Wikipedia][wpc], 2026) | 46.6 | OSM `railway=razed` |
| Banjar–Cijulang | 83 km ([detik][detik], 2017) | 82.2 | Cijulang from an OSM place |
| Purwokerto–Wonosobo | 92 km ([detik][detik], 2017) | 91.9 | |
| Semarang–Demak–Rembang | 110 km ([Wikipedia][wpt], 2026) | | Same corridor as Semarang–Demak–Juana–Rembang, not drawn twice |
| Kedungjati–Ambarawa | 36.7 km ([Kontan][kontan], 2014) | 36.0 | |
| Jombang–Babat–Tuban | 111 km, listed as Tuban–Jombang ([detik][detik], 2017) | 108.6 | |
| Kalisat–Panarukan | ±70 km ([Jurnal Renwilko][renwilko], 2026) | 69.3 | |
| Semarang–Demak–Juana–Rembang | 110 km ([Wikipedia][wpt], 2026) | 110.5 | 72.8 km OSM `railway=razed`; starts at the Jurnatan end of the tram |
| Madiun–Slahung | about 40 km ([ANTARA][antara], 2025); 62 km ([detik][detik], 2017) | 58.1 | See conflict below |
| Sidoarjo–Tulangan–Tarik | 22 km, listed as Sidoarjo–Tarik ([detik][detik], 2017) | 23.3 | OSM tags this track active |
| Kamal–Sumenep | 221 km, Kamal to near Kalianget ([detik][detik23], 2023) | 162.8 | See Madura below |

[detik18]: https://finance.detik.com/infrastruktur/d-3795455/rel-mati-cianjur-padalarang-dan-rangkasbitung-lebak-akan-diaktifkan
[detik23]: https://finance.detik.com/infrastruktur/d-6733757/madura-butuh-kereta-api-perlu-rp-7-t-hidupkan-200-km-jalur-mati-suri
[wpr]: https://id.wikipedia.org/wiki/Jalur_kereta_api_Rancaekek%E2%80%93Tanjungsari
[wpc]: https://id.wikipedia.org/wiki/Jalur_trem_Cirebon%E2%80%93Kadipaten
[wpt]: https://id.wikipedia.org/wiki/Jalur_trem_Jurnatan%E2%80%93Rembang
[detik]: https://finance.detik.com/berita-ekonomi-bisnis/3501896/rencana-hidupkan-1600-km-rel-mati-di-jawa
[kontan]: https://industri.kontan.co.id/news/kai-akan-hidupkan-jalur-ka-kedungjati-ambarawa
[renwilko]: https://ejournal.unesa.ac.id/index.php/renwilko/article/view/77380
[antara]: https://jatim.antaranews.com/berita/985457/pemkab-ponorogo-apresiasi-positif-rencana-kemenhub-aktifkan-jalur-ka

## Points to review

- **Madiun–Slahung lengths conflict.** The route is 58.1 km: 6% under detik's 62 km and 45% over ANTARA's 40 km. It passes the 30% test on the detik figure only. It runs along the OSM way "Jalur Trem Madiun–Slahung" through Ponorogo.
- **Old lengths.** The detik figures date from 2017 and the Kontan figure from 2014. They describe the historic lines, not a 2030 design.
- **Stage.** All drawn lines are `rencana`. Harian Jogja says the 13 lines "masih dikaji". Kontan (2014) describes Kedungjati–Ambarawa land acquisition as under way, but [RRI (2026)](https://rri.co.id/cirebon/sudut-pandang/2367844/manfaat-reaktivasi-jalur-ka-kedungjati-tuntang-untuk-ekonomi-jateng) says the 2013 to 2015 effort stopped and KAI is preparing a new one, so that line stays `rencana`.
- **Target year.** Only Madiun–Slahung has `target_year` (2030, ANTARA and PDI Perjuangan Jawa Timur). Other articles say "hingga 2030" for the programme as a whole, and Arif Anwar of DJKA says funding will decide whether lines go ahead, so that date is not applied per line.
- **ANTARA terms.** The ANTARA page carries a notice against automated crawling and reuse without written permission. This repo uses only one number and a link from it. Check that notice if you plan to reuse more.

## Method

1. `scripts/route-between.py` builds a graph from `rail_disused.geojson` and `rail_active.geojson`.
2. Stations come from one Overpass query for `railway=station` and `halt`, plus disused and abandoned station tags, across the Java bbox. The query result is cached in `data-raw/reactivation/`.
3. The script snaps each stop to the nearest graph vertex, up to 1,500 m away, and chains shortest paths through the stops.
4. A route is accepted only if it, or the part named by `validate_stops`, falls within 30% of a stated length.

**Connectors.** This step goes beyond the original brief. `build-rail-data.mjs` simplifies at 0.0004° (about 44 m), which removes shared vertices at T-junctions and splits the graph into hundreds of components. The script joins a dead end to the nearest point on another component when the gap is 50 m or less. Without connectors, only Kedungjati–Ambarawa resolves.

Accepted routes contain 0 to 151 m of connector in total, and the longest single connector is 43 m. Connectors never join two stations directly. To disable them, run with `--gap-m 0`.

The script also removes the out-and-back retrace where a waypoint station sits on a dead-end spur. That cut 1.2 km from Jombang–Babat–Tuban at Babat.

**Places.** OSM has no station for Kadipaten, Cijulang, Kamal, Sumenep or Jatinangor, so `places` in the config holds their OSM `place` coordinates. Cirebon and Semarang Tawang use the end of the razed way, 426 m and about 650 m from those stations.

**Razed track.** The published rail layers leave out `railway=razed`. The script adds only the ways in `RAZED_NAMES`, for this layer only. The Semarang corridor also joins its own named ways across simplification gaps up to 1,000 m. Its accepted route holds 28 m of connector.

**Sparse vertices.** Sukabumi and Tulangan sit 4.6 and 5.8 km from the nearest vertex after simplification. For these stops the script projects onto the nearest line, up to 1,500 m away.

## Scope to review

- **Sukabumi–Cianjur–Padalarang.** detik's 40 km checks the Cianjur–Padalarang part. I found no readable source for Sukabumi–Cianjur: the Bisnis.com page that appeared to state 38 km returned HTTP 403. The line draws the old alignment, while [CNBC Indonesia (2025)](https://www.cnbcindonesia.com/news/20251208104443-4-691985/titik-terang-jalur-ka-cipatat-padalarang-hidup-lagi-lewat-rute-baru/amp) reports Cipatat–Padalarang on a new alignment via Sasaksaat. Most of the route already carries trains, per [Harian Jogja](https://jogjapolitan.harianjogja.com/r-1230358/pemerintah-akan-hidupkan-lagi-13-jalur-kereta-mati-di-jawa).
- **Madura.** The route ends in Sumenep and takes the short branch past Kwanyar, while detik's 221 km runs to Kalianget. It sits 26% under that figure, close to the 30% limit, so treat this as the weakest match. Madura lies outside Java, although outlets count this line among the Java lines.
- **Sidoarjo–Tulangan–Tarik.** OSM tags the track as active, while the sources list it for reactivation. The line appears in both layers until someone checks it on the ground.
- **Semarang corridor.** All outlets list both names separately. Confirm against the Ripnas document whether they mean one corridor.
