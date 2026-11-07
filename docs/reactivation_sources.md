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

No source names terminal stations separately, so terminals come from the line names. "Stated length" lists only figures given for the same terminals. Status: `resolved` lines are in the GeoJSON.

| Line | Stated length (source, year) | Routed km | Status |
| --- | --- | --- | --- |
| Sukabumi–Cianjur–Padalarang | none | | unresolved |
| Cicalengka–Jatinangor–Tanjungsari | none | | unresolved |
| Cirebon–Kadipaten | 47 km ([detik][detik], 2017) | | unresolved |
| Banjar–Cijulang | 83 km ([detik][detik], 2017) | | unresolved |
| Purwokerto–Wonosobo | 92 km ([detik][detik], 2017) | 91.9 | resolved |
| Semarang–Demak–Rembang | none | | unresolved |
| Kedungjati–Ambarawa | 36.7 km ([Kontan][kontan], 2014) | 36.0 | resolved |
| Jombang–Babat–Tuban | 111 km, listed as Tuban–Jombang ([detik][detik], 2017) | 108.6 | resolved |
| Kalisat–Panarukan | ±70 km ([Jurnal Renwilko][renwilko], 2026) | 69.3 | resolved |
| Semarang–Demak–Juana–Rembang | none | | unresolved |
| Madiun–Slahung | about 40 km ([ANTARA][antara], 2025); 62 km ([detik][detik], 2017) | 58.1 | resolved, see conflict below |
| Sidoarjo–Tulangan–Tarik | 22 km, listed as Sidoarjo–Tarik ([detik][detik], 2017) | | unresolved |
| Kamal–Sumenep | none | | unresolved |

[detik]: https://finance.detik.com/berita-ekonomi-bisnis/3501896/rencana-hidupkan-1600-km-rel-mati-di-jawa
[kontan]: https://industri.kontan.co.id/news/kai-akan-hidupkan-jalur-ka-kedungjati-ambarawa
[renwilko]: https://ejournal.unesa.ac.id/index.php/renwilko/article/view/77380
[antara]: https://jatim.antaranews.com/berita/985457/pemkab-ponorogo-apresiasi-positif-rencana-kemenhub-aktifkan-jalur-ka

## Points to review

- **Madiun–Slahung lengths conflict.** The route is 58.1 km: 6% under detik's 62 km and 45% over ANTARA's 40 km. It passes the 30% test on the detik figure only. It runs along the OSM way "Jalur Trem Madiun–Slahung" through Ponorogo.
- **Old lengths.** The detik figures date from 2017 and the Kontan figure from 2014. They describe the historic lines, not a 2030 design.
- **Stage.** All five resolved lines are `rencana`. Harian Jogja says the 13 lines "masih dikaji". Kontan (2014) describes Kedungjati–Ambarawa land acquisition as under way, but [RRI (2026)](https://rri.co.id/cirebon/sudut-pandang/2367844/manfaat-reaktivasi-jalur-ka-kedungjati-tuntang-untuk-ekonomi-jateng) says the 2013 to 2015 effort stopped and KAI is preparing a new one, so that line stays `rencana`.
- **Target year.** Only Madiun–Slahung has `target_year` (2030, ANTARA and PDI Perjuangan Jawa Timur). Other articles say "hingga 2030" for the programme as a whole, and Arif Anwar of DJKA says funding will decide whether lines go ahead, so that date is not applied per line.
- **ANTARA terms.** The ANTARA page carries a notice against automated crawling and reuse without written permission. This repo uses only one number and a link from it. Check that notice if you plan to reuse more.

## Method

1. `scripts/route-between.py` builds a graph from `rail_disused.geojson` and `rail_active.geojson`.
2. Stations come from one Overpass query for `railway=station` and `halt`, plus disused and abandoned station tags, across the Java bbox. The query result is cached in `data-raw/reactivation/`.
3. The script snaps each stop to the nearest graph vertex, up to 1,500 m away, and chains shortest paths through the stops.
4. A route is accepted only if it falls within 30% of a stated length.

**Connectors.** This step goes beyond the original brief. `build-rail-data.mjs` simplifies at 0.0004° (about 44 m), which removes shared vertices at T-junctions and splits the graph into hundreds of components. The script joins a dead end to the nearest point on another component when the gap is 50 m or less. Without connectors, only Kedungjati–Ambarawa resolves.

Accepted routes contain 0 to 56 m of connector in total, and the longest single connector is 40 m. The set of resolved lines stays the same at 50, 100, 150 and 300 m. Connectors never join two stations directly. To disable them, run with `--gap-m 0`.

The script also removes the out-and-back retrace where a waypoint station sits on a dead-end spur. That cut 1.2 km from Jombang–Babat–Tuban at Babat.

## TODO manual digitizing

| Line | Reason unresolved |
| --- | --- |
| Sukabumi–Cianjur–Padalarang | The Sukabumi OSM station is 4.6 km from any graph vertex, and no source states a length. Sources also disagree on scope: [Harian Jogja](https://jogjapolitan.harianjogja.com/r-1230358/pemerintah-akan-hidupkan-lagi-13-jalur-kereta-mati-di-jawa) quotes DJKA saying Bogor–Sukabumi toward Padalarang already operates, and [CNBC Indonesia (2025)](https://www.cnbcindonesia.com/news/20251208104443-4-691985/titik-terang-jalur-ka-cipatat-padalarang-hidup-lagi-lewat-rute-baru/amp) reports Cipatat–Padalarang under way on a new alignment via Sasaksaat. OSM track would not match a new alignment. |
| Cicalengka–Jatinangor–Tanjungsari | OSM has no Jatinangor station, and no source states a length for these terminals. detik's 25 km covers Rancaekek–Tanjungsari, which has a different terminal. Outlets spell the waypoint both "Jatinangor" and "Jatinganor". |
| Cirebon–Kadipaten | OSM has no Kadipaten station. |
| Banjar–Cijulang | OSM has no Cijulang station. |
| Semarang–Demak–Rembang | No source states a length for these terminals. The route found is 185.6 km and uses 66 km of active track, far longer than detik's 122 km for Semarang–Lasem, a line that continues past Rembang. Treat that route as wrong. |
| Semarang–Demak–Juana–Rembang | Same as above, with the same 185.6 km route. OSM spells the waypoint "Juwana". All outlets list this line and Semarang–Demak–Rembang separately, though they may be one corridor. Confirm against the Ripnas document before digitizing both. |
| Sidoarjo–Tulangan–Tarik | The Tulangan OSM station is 5.8 km from any graph vertex, so `rail_disused` lacks that track. The stated 22 km also names different terminals. |
| Kamal–Sumenep | OSM has no Kamal or Sumenep station, and no source states a length. This line is on Madura, although outlets count it among the Java lines. detik's 113 km covers Kamal–Pamekasan only. |
