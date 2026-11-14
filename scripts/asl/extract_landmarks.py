"""Runs the game's own hand model over an image dataset and saves the landmarks, for the accuracy
check in train.py. Needs: uv pip install mediapipe pyarrow pillow numpy

    venv/bin/python scripts/asl/extract_landmarks.py public/models/hand_landmarker.task images.parquet out.json

`images.parquet` must have an `image` column (encoded bytes) and an integer `label` column, 0 = A … 25 = Z,
e.g. data/train-00000-of-00001.parquet from Marxulia/asl_sign_languages_alphabets_v03 on Hugging Face.
"""
import io, json, sys
import mediapipe as mp
import numpy as np
import pyarrow.parquet as pq
from PIL import Image

model, parquet, out = sys.argv[1:4]
options = mp.tasks.vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=model), num_hands=1)
detector = mp.tasks.vision.HandLandmarker.create_from_options(options)
table = pq.read_table(parquet)
rows = []
for im, label in zip(table.column("image").to_pylist(), table.column("label").to_pylist()):
    pil = Image.open(io.BytesIO(im["bytes"])).convert("RGB")
    res = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(pil)))
    if res.hand_landmarks:
        rows.append({"label": int(label), "w": pil.size[0], "h": pil.size[1], "img": [[p.x, p.y, p.z] for p in res.hand_landmarks[0]]})
print("hands found in", len(rows), "of", table.num_rows, "images")
json.dump(rows, open(out, "w"))
