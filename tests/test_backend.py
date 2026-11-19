import io
import json
import math
import statistics
import sys
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import shapefile
from fastapi import HTTPException
from starlette.datastructures import UploadFile

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

import ee  # noqa: E402
import main as backend_main  # noqa: E402


class DummyEEFeature:
    def __init__(self, geom, props):
        self.geom = geom
        self.props = props


def make_zipped_shapefile(layers_dict: dict[str, list[tuple[str, list[list[float]]]]]) -> bytes:
    """Builds an in-memory zipped ESRI Shapefile archive with one or more polygon layers."""
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for layer_name, records in layers_dict.items():
            shp_io = io.BytesIO()
            shx_io = io.BytesIO()
            dbf_io = io.BytesIO()
            with shapefile.Writer(shp=shp_io, shx=shx_io, dbf=dbf_io) as w:
                w.field("NAME_1", "C")
                for region_name, ring in records:
                    w.poly([ring])
                    w.record(region_name)
            zf.writestr(f"{layer_name}.shp", shp_io.getvalue())
            zf.writestr(f"{layer_name}.shx", shx_io.getvalue())
            zf.writestr(f"{layer_name}.dbf", dbf_io.getvalue())
    return zip_buf.getvalue()


class TestPhyloCovBackend(unittest.IsolatedAsyncioTestCase):
    def test_normalize_sample_date(self):
        self.assertEqual(backend_main.normalize_sample_date("2021-03-15"), "2021-03-15")
        self.assertEqual(backend_main.normalize_sample_date("2021/03/15"), "2021-03-15")
        self.assertEqual(backend_main.normalize_sample_date("2021-03-15T14:22:00Z"), "2021-03-15")
        self.assertEqual(backend_main.normalize_sample_date("15/03/2021"), "2021-03-15")
        self.assertEqual(backend_main.normalize_sample_date("03/15/21"), "2021-03-15")
        self.assertEqual(backend_main.normalize_sample_date("2021-03"), "2021-03-01")
        self.assertEqual(backend_main.normalize_sample_date("2021"), "2021-01-01")
        self.assertIsNone(backend_main.normalize_sample_date(""))
        self.assertIsNone(backend_main.normalize_sample_date("invalid_date"))

    def test_area_weighted_polygon_centroid(self):
        # 10x10 square with 500 densely digitized points along the x=0 western border
        dense_west = [[0.0, y / 50.0] for y in range(501)]
        ring = dense_west + [[10.0, 10.0], [10.0, 0.0], [0.0, 0.0]]
        poly = {"type": "Polygon", "coordinates": [ring]}
        clat, clon = backend_main.compute_geojson_centroid(poly)
        self.assertAlmostEqual(clat, 5.0, places=5)
        self.assertAlmostEqual(clon, 5.0, places=5)

    def test_sanitize_col_identifier_and_window_suffix(self):
        self.assertEqual(
            backend_main.sanitize_col_identifier("ESA/WorldCover/v100/2020", "Map", "mode"),
            "esa_worldcover_map_mode",
        )
        self.assertEqual(
            backend_main.sanitize_col_identifier("CIESIN/GPWv411/GPW_Population_Density", "population_density", "mean"),
            "ciesin_gpwv411_population_density_mean",
        )
        self.assertEqual(backend_main.format_temporal_window_suffix(0, 0), "")
        self.assertEqual(backend_main.format_temporal_window_suffix(0, 30), "_win30d")
        self.assertEqual(backend_main.format_temporal_window_suffix(14, 30), "_lag14d_win30d")

    def test_beast_glm_matrices_and_standardization(self):
        locs = ["Cape_Town", "Durban", "Johannesburg"]
        centroids = {
            "Cape_Town": (-33.9249, 18.4241),
            "Durban": (-29.8587, 31.0218),
            "Johannesburg": (-26.2041, 28.0473),
        }
        cov_vals = {"chirps_precipitation_mean": {"Cape_Town": 2.1, "Durban": 4.8, "Johannesburg": 3.2}}
        dist_m, cov_m, edge_rows, edge_headers = backend_main.build_beast_glm_matrices(
            locs, centroids, cov_vals, ["chirps_precipitation_mean"]
        )
        self.assertEqual(len(edge_rows), 6)  # K * (K - 1) directed edges
        for key in ("origin_std", "destination_std", "abs_diff_std", "average_std"):
            mat = cov_m["chirps_precipitation_mean"][key]
            off_diag = [mat[i][j] for i in range(3) for j in range(3) if i != j]
            for i in range(3):
                self.assertEqual(mat[i][i], 0.0)
            self.assertAlmostEqual(statistics.mean(off_diag), 0.0, places=5)
            self.assertAlmostEqual(statistics.stdev(off_diag), 1.0, places=5)

        # Verify log distance baseline
        d_ct_dbn = backend_main.calculate_haversine_distance(-33.9249, 18.4241, -29.8587, 31.0218)
        self.assertTrue(1200 < d_ct_dbn < 1350)
        self.assertAlmostEqual(dist_m["log"][0][1], round(math.log(d_ct_dbn), 4), places=4)

    async def test_inspect_multilayer_shapefile_and_crs_guard(self):
        shp_bytes = make_zipped_shapefile({
            "gadm_adm0": [("South_Africa", [[18.0, -34.0], [32.0, -34.0], [32.0, -22.0], [18.0, -22.0], [18.0, -34.0]])],
            "gadm_adm1": [
                ("Western_Cape", [[18.2, -34.4], [20.8, -34.4], [20.8, -32.6], [18.2, -32.6], [18.2, -34.4]]),
                ("Gauteng", [[27.3, -26.7], [29.1, -26.7], [29.1, -25.2], [27.3, -25.2], [27.3, -26.7]]),
            ],
        })
        upload = UploadFile(filename="zaf_gadm.zip", file=io.BytesIO(shp_bytes))
        res = await backend_main.inspect_boundary(file=upload, layer_name="gadm_adm1")
        self.assertEqual(res["layers"], ["gadm_adm0", "gadm_adm1"])
        self.assertEqual(res["selected_layer"], "gadm_adm1")
        self.assertEqual(res["feature_count"], 2)
        self.assertIn("NAME_1", res["property_keys"])

        # Projected UTM coordinates (>180 deg) should be rejected with HTTP 400
        utm_bytes = make_zipped_shapefile({
            "utm_layer": [("Bad_CRS", [[500000.0, 6200000.0], [510000.0, 6200000.0], [510000.0, 6210000.0], [500000.0, 6200000.0]])]
        })
        bad_upload = UploadFile(filename="utm.zip", file=io.BytesIO(utm_bytes))
        with self.assertRaises(HTTPException) as ctx:
            await backend_main.inspect_boundary(file=bad_upload, layer_name=None)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("EPSG:4326", ctx.exception.detail)

    async def test_extract_custom_only_static_and_mixed_glm_zip(self):
        def fake_extract_custom(feat_list, spec, use_manual_rng, start_dt, end_dt, has_dt, sp_reducer, lag_days, window_days):
            col = backend_main.sanitize_col_identifier(spec["asset_id"], spec["band"], sp_reducer)
            if spec.get("asset_type") != "Image" and not use_manual_rng and has_dt:
                col += backend_main.format_temporal_window_suffix(lag_days, window_days)
            return spec["asset_id"], col, {0: 10.0, 1: 50.0, 2: 30.0}

        def fake_extract_preset(feat_list, ds, use_manual_rng, start_dt, end_dt, has_dt, sp_reducer, lag_days, window_days):
            suf = backend_main.format_temporal_window_suffix(lag_days, window_days) if (ds != "srtm" and not use_manual_rng and has_dt) else ""
            return ds, f"{ds}_precipitation_{sp_reducer}{suf}", {0: 3.4, 1: 8.1, 2: 5.2}

        # A) Custom-only static Image extraction on dateless CSV with skipped NA row
        csv_bytes = (
            "sample_id,latitude,longitude,location\n"
            "S1,-33.92,18.42,Cape_Town\n"
            "S_SKIP,NA,NA,Missing\n"
            "S2,-26.20,28.04,Johannesburg\n"
        ).encode("utf-8")
        custom_static = json.dumps([{
            "asset_id": "ESA/WorldCover/v100/2020",
            "asset_type": "Image",
            "band": "Map",
            "temporal_reducer": "none",
            "multiplier": 1.0,
            "offset": 0.0,
            "resolution": 10,
        }])

        with patch.object(ee.Geometry, "Point", side_effect=lambda c: c), \
             patch.object(ee, "Feature", side_effect=DummyEEFeature), \
             patch.object(backend_main, "extract_custom_dataset_values", fake_extract_custom):
            resp = await backend_main.extract_glm_covariates(
                file=UploadFile(filename="pts.csv", file=io.BytesIO(csv_bytes)),
                dataset=None,
                datasets=None,
                custom_datasets=custom_static,
                start_date=None,
                end_date=None,
                lag_days=0,
                window_days=0,
                generate_matrices=False,
                location_col=None,
                matrix_aggregation="mean",
                layer_name=None,
            )
            body = b"".join([c if isinstance(c, bytes) else c.encode("utf-8") async for c in resp.body_iterator])
            lines = body.decode("utf-8").strip().splitlines()
            self.assertEqual(len(lines), 3)
            self.assertTrue(lines[1].endswith(",10.0"))
            self.assertTrue(lines[2].endswith(",50.0"))

        # B) Mixed Preset + Custom ImageCollection + Lag/Window + BEAST GLM ZIP on GeoJSON Boundaries
        geojson_bytes = json.dumps({
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"NAME_1": "Western_Cape", "date": "2021-03-15"}, "geometry": {"type": "Polygon", "coordinates": [[[18.2, -34.4], [20.8, -34.4], [20.8, -32.6], [18.2, -32.6], [18.2, -34.4]]]}},
                {"type": "Feature", "properties": {"NAME_1": "KwaZulu_Natal", "date": "2021-06-20"}, "geometry": {"type": "Polygon", "coordinates": [[[29.5, -30.8], [32.2, -30.8], [32.2, -27.8], [29.5, -27.8], [29.5, -30.8]]]}},
                {"type": "Feature", "properties": {"NAME_1": "Gauteng", "date": "2021-09-10"}, "geometry": {"type": "Polygon", "coordinates": [[[27.3, -26.7], [29.1, -26.7], [29.1, -25.2], [27.3, -25.2], [27.3, -26.7]]]}},
            ],
        }).encode("utf-8")
        custom_temp = json.dumps([{
            "asset_id": "CIESIN/GPWv411/GPW_Population_Density",
            "asset_type": "ImageCollection",
            "band": "population_density",
            "temporal_reducer": "mean",
            "multiplier": 1.0,
            "offset": 0.0,
            "resolution": 927,
        }])

        with patch.object(ee, "Geometry", side_effect=lambda g: g), \
             patch.object(ee, "Feature", side_effect=DummyEEFeature), \
             patch.object(backend_main, "extract_single_dataset_values", fake_extract_preset), \
             patch.object(backend_main, "extract_custom_dataset_values", fake_extract_custom):
            resp_zip = await backend_main.extract_glm_covariates(
                file=UploadFile(filename="demes.geojson", file=io.BytesIO(geojson_bytes)),
                dataset=None,
                datasets="chirps",
                custom_datasets=custom_temp,
                start_date=None,
                end_date=None,
                lag_days=14,
                window_days=30,
                generate_matrices=True,
                location_col="NAME_1",
                matrix_aggregation="median",
                layer_name=None,
            )
            zip_bytes = b"".join([c if isinstance(c, bytes) else c.encode("utf-8") async for c in resp_zip.body_iterator])
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                names = zf.namelist()
                self.assertIn("matrix_ciesin_gpwv411_population_density_median_lag14d_win30d_origin_std.csv", names)
                self.assertIn("matrix_chirps_precipitation_median_lag14d_win30d_abs_difference_std.csv", names)
                self.assertIn("enriched_boundaries.geojson", names)
                self.assertIn("location_summary.csv", names)
                self.assertIn("glm_pairwise_edge_list.csv", names)
                readme = zf.read("README_BEAST_GLM.txt").decode("utf-8")
                self.assertIn("lag=14d, window=30d", readme)
                self.assertIn("Zonal Median across boundaries", readme)


if __name__ == "__main__":
    unittest.main()
