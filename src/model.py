"""
ML Model module.
Trains XGBoost regressor for LST prediction and computes SHAP attributions.
"""
import os
import json
import numpy as np
import pandas as pd
import joblib
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score


def train_model(X, y, save_dir=None):
    """
    Train XGBoost model for LST prediction.
    Returns trained model and evaluation metrics.
    """
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    # Evaluate
    y_pred = model.predict(X_test)
    metrics = {
        "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 3),
        "mae": round(float(mean_absolute_error(y_test, y_pred)), 3),
        "r2": round(float(r2_score(y_test, y_pred)), 4),
        "n_train": len(X_train),
        "n_test": len(X_test),
    }

    print(f" Model Performance:")
    print(f"   RMSE: {metrics['rmse']}°C")
    print(f"   MAE:  {metrics['mae']}°C")
    print(f"   R²:   {metrics['r2']}")

    # Save model
    if save_dir:
        os.makedirs(save_dir, exist_ok=True)
        model_path = os.path.join(save_dir, "xgboost_lst.json")
        model.save_model(model_path)
        print(f" Model saved: {model_path}")

        metrics_path = os.path.join(save_dir, "metrics.json")
        with open(metrics_path, "w") as f:
            json.dump(metrics, f, indent=2)

    return model, metrics, X_test, y_test


def compute_shap_values(model, X, feature_names=None):
    """
    Compute SHAP values for explainability.
    Returns SHAP values DataFrame and global importance.
    """
    import shap

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)

    # Create DataFrame of SHAP values
    if feature_names is None:
        feature_names = X.columns.tolist() if hasattr(X, 'columns') else \
            [f"f{i}" for i in range(X.shape[1])]

    shap_df = pd.DataFrame(shap_values, columns=feature_names)

    # Global feature importance (mean absolute SHAP)
    global_importance = pd.DataFrame({
        "feature": feature_names,
        "mean_abs_shap": np.abs(shap_values).mean(axis=0),
        "mean_shap": shap_values.mean(axis=0),
    }).sort_values("mean_abs_shap", ascending=False)

    return shap_df, global_importance


def get_cell_drivers(shap_df, cell_index, feature_values, top_n=5):
    """
    Get the top N drivers for a specific cell.
    Returns list of driver dicts sorted by absolute SHAP value.
    """
    cell_shap = shap_df.iloc[cell_index]
    cell_features = feature_values.iloc[cell_index] if hasattr(feature_values, 'iloc') \
        else feature_values[cell_index]

    drivers = []
    for feat in cell_shap.index:
        sv = float(cell_shap[feat])
        fv = float(cell_features[feat]) if feat in cell_features.index else 0
        drivers.append({
            "feature": feat,
            "shap_value": round(sv, 3),
            "feature_value": round(fv, 3),
            "direction": "cooling" if sv < 0 else "heating",
        })

    drivers.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
    return drivers[:top_n]


def load_model(model_dir):
    """Load a saved XGBoost model."""
    model = XGBRegressor()
    model.load_model(os.path.join(model_dir, "xgboost_lst.json"))
    return model
