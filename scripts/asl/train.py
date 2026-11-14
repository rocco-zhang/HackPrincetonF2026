"""Trains the ASL fingerspelling classifier that ships in src/asl/model.json.

Training data: sid220/asl-now-fingerspelling on Hugging Face (MIT licence): MediaPipe hand
landmarks of the ASL alphabet, signed into webcams by several people.

    git clone https://huggingface.co/datasets/sid220/asl-now-fingerspelling
    uv venv --python 3.12 venv && uv pip install --python venv/bin/python numpy scikit-learn
    venv/bin/python scripts/asl/train.py asl-now-fingerspelling src/asl/model.json [check_landmarks.json]

The optional third argument is the output of scripts/asl/extract_landmarks.py run on a second,
independent image dataset. It is only used to measure accuracy; nothing from it is shipped.
"""
import glob, json, os, sys, warnings
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

warnings.filterwarnings("ignore")
rng = np.random.default_rng(0)
LETTERS = list("ABCDEFGHIKLMNOPQRSTUVWXY")  # no J, Z: they are movements
PALM = [(0, 5), (0, 9), (0, 13), (0, 17), (5, 9), (9, 13), (13, 17)]
# The dataset stores x and y as fractions of the frame, without the frame's shape. A palm is
# rigid, so the right width/height is the one where palm proportions vary least across samples;
# that comes out between 4:3 and 16:9, i.e. a mix of both cameras. 1.5 plus the stretch in
# augment() covers either.
ASPECT = 1.5


def feats(P):
    """(n,21,3) landmarks in isotropic units → (n,63). Same maths as src/asl/features.ts."""
    P = P - P[:, :1]
    s = np.mean([np.linalg.norm(P[:, i] - P[:, j], axis=1) for i, j in PALM], axis=0)
    P = P / s[:, None, None]
    c = P[:, 5, 0] * P[:, 17, 1] - P[:, 5, 1] * P[:, 17, 0]
    P[:, :, 0] *= np.where(c < 0, -1.0, 1.0)[:, None]
    return P.reshape(len(P), 63)


def augment(P, n, turn_deg=18):
    """Copies with a random in-plane turn, tilt, stretch (unknown camera shape) and landmark noise."""
    out = []
    for _ in range(n):
        Q = P - P[:, :1]
        a, b, g = (rng.normal(0, np.radians(d), len(Q))[:, None] for d in (turn_deg, 10, 10))
        x, y, z = Q[..., 0], Q[..., 1], Q[..., 2]
        x, y = x * np.cos(a) - y * np.sin(a), x * np.sin(a) + y * np.cos(a)  # in the image plane
        x, z = x * np.cos(b) + z * np.sin(b), -x * np.sin(b) + z * np.cos(b)  # turned left/right
        y, z = y * np.cos(g) - z * np.sin(g), y * np.sin(g) + z * np.cos(g)  # tipped forward/back
        Q = np.stack([x * rng.uniform(0.86, 1.16, (len(Q), 1)), y, z * rng.uniform(0.7, 1.3, (len(Q), 1))], -1)
        size = np.linalg.norm(Q[:, 9], axis=1)[:, None, None]
        out.append(Q + rng.normal(0, 0.02, Q.shape) * size)
    return np.concatenate(out)


def upright(F):
    """Turn every hand so it points up: compares handshape only."""
    P = F.reshape(-1, 21, 3).copy()
    a = -np.arctan2(P[:, 9, 0], -P[:, 9, 1])
    c, s = np.cos(a)[:, None], np.sin(a)[:, None]
    P[..., 0], P[..., 1] = P[..., 0] * c - P[..., 1] * s, P[..., 0] * s + P[..., 1] * c
    return P.reshape(-1, 63)


def fit(X, y, prep=lambda F: F, n_aug=30):
    A = np.concatenate([X, augment(X, n_aug)])
    m = MLPClassifier(hidden_layer_sizes=(128, 64), alpha=1e-3, max_iter=60, early_stopping=True, random_state=0)
    return m.fit(prep(feats(A)), np.tile(y, n_aug + 1))


def load_training(folder):
    X, y = [], []
    for L in LETTERS:
        for f in sorted(glob.glob(os.path.join(folder, L, "*.json"))):
            d = json.load(open(f))
            if len(d) == 21:
                X.append([[p["x"] * ASPECT, p["y"], p["z"] * ASPECT] for p in d])
                y.append(LETTERS.index(L))
    return np.array(X), np.array(y)


def shape_check(X, y, path):
    """Accuracy on a second dataset, on handshape only (its images were rotated at random).
    K/P, G/Q and H/U are the same handshape pointing different ways, so they count as right."""
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    rows = [r for r in json.load(open(path)) if alphabet[r["label"]] in LETTERS]
    Xc = np.array([np.array(r["img"]) * np.array([r["w"] / r["h"], 1.0, r["w"] / r["h"]]) for r in rows])
    yc = np.array([LETTERS.index(alphabet[r["label"]]) for r in rows])
    pred = fit(X, y, upright).predict(upright(feats(Xc)))
    same = {"K": "P", "P": "K", "G": "Q", "Q": "G", "H": "U", "U": "H"}
    ok = np.array([p == t or same.get(LETTERS[t]) == LETTERS[p] for t, p in zip(yc, pred)])
    print(f"second dataset, handshape only: {ok.mean():.3f} on {len(ok)} images")
    print("  per letter:", {L: round(float(ok[yc == i].mean()), 2) for i, L in enumerate(LETTERS)})
    return round(float(ok.mean()), 3), {L: round(float(ok[yc == i].mean()), 2) for i, L in enumerate(LETTERS)}


if __name__ == "__main__":
    folder, out = sys.argv[1:3]
    X, y = load_training(folder)
    print("training examples:", len(X), "per letter:", dict(zip(LETTERS, np.bincount(y))))

    Xa, Xb, ya, yb = train_test_split(X, y, test_size=0.2, random_state=1, stratify=y)
    held_out = float(fit(Xa, ya).score(feats(Xb), yb))
    print(f"held-out 20% of the same dataset (same signers, so optimistic): {held_out:.3f}")
    check, per_letter = shape_check(X, y, sys.argv[3]) if len(sys.argv) > 3 else (None, None)

    m = fit(X, y)  # the shipped model: all the training data, hand direction kept
    F = feats(X)
    protos, proto_check = {}, {}
    for i, L in enumerate(LETTERS):  # a real example of each letter: the one closest to all the others
        G = F[y == i]
        f = G[np.linalg.norm(G[:, None] - G[None], axis=2).sum(1).argmin()]
        protos[L] = [round(float(v), 3) for v in f]
        p = m.predict_proba(np.array([protos[L]]))[0]
        proto_check[L] = [LETTERS[int(p.argmax())], round(float(p.max()), 4)]
    r4 = lambda a: [round(float(v), 4) for v in a]
    json.dump(
        {
            "source": "sid220/asl-now-fingerspelling (MIT) on Hugging Face",
            "letters": LETTERS,
            "layers": [{"w": [r4(row) for row in W.T], "b": r4(b)} for W, b in zip(m.coefs_, m.intercepts_)],
            "prototypes": protos,
            "protoCheck": proto_check,  # what this script's model says for each prototype: lets the TS tests verify the port
            "heldOutAccuracy": round(held_out, 3),
            "checkAccuracy": check,
            "checkPerLetter": per_letter,
        },
        open(out, "w"),
        separators=(",", ":"),
    )
    print("wrote", out, f"({os.path.getsize(out) // 1024} KB)")
