from data.dataset_builder import build_feature_windows


def test_build_feature_windows_returns_overlapping_windows():
    features = [{"idx": i} for i in range(6)]
    windows = build_feature_windows(features, window_size=3, stride=1)

    assert len(windows) == 4
    assert windows[0][0]["idx"] == 0
    assert windows[1][0]["idx"] == 1
    assert windows[-1][-1]["idx"] == 5


def test_build_feature_windows_empty_for_short_series():
    features = [{"idx": 1}, {"idx": 2}]
    windows = build_feature_windows(features, window_size=3, stride=1)

    assert windows == []
