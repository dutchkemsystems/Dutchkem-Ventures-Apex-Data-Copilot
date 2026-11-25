from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from ultralytics import YOLO


@dataclass(slots=True)
class BoundingBox:
    id: str
    label: str
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(slots=True)
class BoxEvaluation:
    box_id: str
    label: str
    matched_reference_label: str | None
    iou: float
    flagged: bool
    reason: str | None


@dataclass(slots=True)
class VisionQaReport:
    iou_threshold: float
    total_boxes: int
    flagged_count: int
    mean_iou: float
    passed: bool
    evaluations: list[BoxEvaluation]


def compute_iou(box_a: BoundingBox, box_b: BoundingBox) -> float:
    inter_x1 = max(box_a.x1, box_b.x1)
    inter_y1 = max(box_a.y1, box_b.y1)
    inter_x2 = min(box_a.x2, box_b.x2)
    inter_y2 = min(box_a.y2, box_b.y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, box_a.x2 - box_a.x1) * max(0.0, box_a.y2 - box_a.y1)
    area_b = max(0.0, box_b.x2 - box_b.x1) * max(0.0, box_b.y2 - box_b.y1)
    union_area = area_a + area_b - inter_area

    if union_area <= 0.0:
        return 0.0
    return inter_area / union_area


class VisionQaEngine:
    """
    Validates human/model bounding-box annotations against YOLOv8 reference
    detections using Intersection over Union (IoU). Flags any box with IoU < 0.70.
    """

    IOU_THRESHOLD = 0.70

    def __init__(self, model_weights: str = "yolov8n.pt") -> None:
        self._model = YOLO(model_weights)

    def detect_reference_boxes(self, image_path: str) -> list[BoundingBox]:
        results = self._model.predict(source=image_path, verbose=False)
        boxes: list[BoundingBox] = []
        for idx, r in enumerate(results):
            for j, box in enumerate(r.boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_id = int(box.cls[0].item())
                label = r.names.get(cls_id, str(cls_id))
                boxes.append(BoundingBox(id=f"yolo_{idx}_{j}", label=label, x1=x1, y1=y1, x2=x2, y2=y2))
        return boxes

    def evaluate_annotations(
        self,
        candidate_boxes: Sequence[BoundingBox],
        reference_boxes: Sequence[BoundingBox],
    ) -> VisionQaReport:
        evaluations: list[BoxEvaluation] = []
        for cand in candidate_boxes:
            best_iou = 0.0
            best_ref: BoundingBox | None = None
            for ref in reference_boxes:
                score = compute_iou(cand, ref)
                if score > best_iou:
                    best_iou = score
                    best_ref = ref

            flagged = best_iou < self.IOU_THRESHOLD
            reason = None
            if flagged:
                reason = f"IoU {best_iou:.3f} is below required 0.700 threshold."
            elif best_ref and best_ref.label.lower() != cand.label.lower():
                flagged = True
                reason = f"Class label mismatch: annotated '{cand.label}', expected '{best_ref.label}'."

            evaluations.append(
                BoxEvaluation(
                    box_id=cand.id,
                    label=cand.label,
                    matched_reference_label=best_ref.label if best_ref else None,
                    iou=round(best_iou, 4),
                    flagged=flagged,
                    reason=reason,
                )
            )

        flagged_count = sum(1 for e in evaluations if e.flagged)
        mean_iou = (
            sum(e.iou for e in evaluations) / len(evaluations)
            if evaluations
            else 0.0
        )
        return VisionQaReport(
            iou_threshold=self.IOU_THRESHOLD,
            total_boxes=len(evaluations),
            flagged_count=flagged_count,
            mean_iou=round(mean_iou, 4),
            passed=flagged_count == 0 and len(evaluations) > 0,
            evaluations=evaluations,
        )
