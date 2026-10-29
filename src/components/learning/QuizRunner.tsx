"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlarmClock, Send } from "lucide-react";
import { clsx } from "clsx";
import { submitAttemptAction } from "@/app/learn/actions";
import { answerStorageKey, formatCountdown, secondsLeft } from "@/components/learning/quiz-clock";
import { Modal } from "@/components/Modal";
import { Button, Input } from "@/components/ui";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";

export type QuizQuestion = { position: number; typed: boolean; instruction: string; prompt: string; options: string[] };

type Answers = Record<string, string>;

function loadAnswers(key: string): Answers {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string"));
    }
  } catch {
    // Trình duyệt chặn lưu trữ hoặc dữ liệu hỏng: làm bài từ đầu, chỉ không giữ được khi tải lại.
  }
  return {};
}

function storeAnswers(key: string, answers: Answers | null) {
  try {
    if (answers) window.localStorage.setItem(key, JSON.stringify(answers));
    else window.localStorage.removeItem(key);
  } catch {
    // Như trên: không lưu được thì thôi, câu trả lời vẫn nằm trong trang.
  }
}

/**
 * Trang làm bài: câu trả lời giữ trong localStorage (lỡ tải lại hay mất mạng không mất bài), có
 * đồng hồ đếm ngược theo giờ máy chủ và tự nộp khi hết giờ. Chấm điểm hoàn toàn ở máy chủ.
 */
export function QuizRunner({
  attemptId,
  questions,
  endsAt,
  serverNow
}: {
  attemptId: string;
  questions: QuizQuestion[];
  /** Hết giờ lúc nào (ms), null nếu không giới hạn thời gian. */
  endsAt: number | null;
  serverNow: number;
}) {
  const storageKey = answerStorageKey(attemptId);
  const [answers, setAnswers] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    setAnswers(loadAnswers(storageKey));
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (loaded) storeAnswers(storageKey, answers);
  }, [answers, loaded, storageKey]);

  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (endsAt === null) return;
    const offset = serverNow - Date.now();
    const tick = () => setLeft(secondsLeft(endsAt, offset));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, serverNow]);
  const timeUp = left !== null && left <= 0;

  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const markStale = useRefreshWhenIdle(pending);

  function submit() {
    setConfirming(false);
    setError("");
    startTransition(async () => {
      try {
        const result = await submitAttemptAction(attemptId, answersRef.current);
        if (result.error) {
          setError(result.error);
          return;
        }
        storeAnswers(storageKey, null);
        setDone(true);
        // Trang kết quả hiện tại chỗ này: về đầu trang để thấy điểm ngay, không phải đang ở cuối đề.
        // "instant" vì html đặt scroll-behavior: smooth, cuộn mượt bị trang kết quả cắt ngang giữa chừng.
        window.scrollTo({ top: 0, behavior: "instant" });
        markStale();
      } catch {
        setError("Không kết nối được máy chủ. Câu trả lời vẫn lưu trên máy này, em kiểm tra mạng rồi bấm Nộp bài lại nhé.");
      }
    });
  }

  // Hết giờ thì tự nộp một lần; nộp không được (mất mạng) thì em bấm Nộp bài lại.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!timeUp || !loaded || autoSubmitted.current) return;
    autoSubmitted.current = true;
    submit();
  });

  const setAnswer = (position: number, value: string) => setAnswers((prev) => ({ ...prev, [position]: value }));
  const unanswered = questions.filter((q) => !answers[q.position]?.trim());
  const answeredCount = questions.length - unanswered.length;
  const locked = pending || done || timeUp;

  function goTo(position: number) {
    setConfirming(false);
    // Đợi hộp thoại đóng (trả focus về nút cũ) rồi mới đưa con trỏ tới câu cần làm.
    window.setTimeout(() => {
      const card = document.getElementById(`cau-${position}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }, 0);
  }

  return (
    <>
      <ol className="grid gap-4 pb-28">
        {questions.map((q) => (
          <li key={q.position} id={`cau-${q.position}`} className="scroll-mt-32 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Câu {q.position} · {q.instruction}
            </p>
            <p className="mt-1 break-words text-lg font-bold text-neutralText">{q.prompt}</p>
            {q.typed ? (
              <Input
                aria-label={`Câu ${q.position}: gõ từ tiếng Anh`}
                value={answers[q.position] ?? ""}
                onChange={(event) => setAnswer(q.position, event.target.value)}
                disabled={locked}
                maxLength={200}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Gõ từ tiếng Anh"
                className="mt-3 h-12 text-base"
              />
            ) : (
              <div role="radiogroup" aria-label={`Câu ${q.position}`} className="mt-3 grid gap-2 sm:grid-cols-2">
                {q.options.map((option) => {
                  const checked = answers[q.position] === option;
                  return (
                    <label
                      key={option}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                        checked ? "border-primary bg-indigo-50 font-semibold text-primary" : "border-stone-200",
                        locked ? "cursor-not-allowed opacity-70" : !checked && "cursor-pointer hover:border-stone-300 hover:bg-stone-50"
                      )}
                    >
                      <input
                        type="radio"
                        name={`cau-${q.position}`}
                        value={option}
                        checked={checked}
                        disabled={locked}
                        onChange={() => setAnswer(q.position, option)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 break-words">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="h-1 bg-stone-100">
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm tabular-nums">
            <p className="font-semibold text-neutralText">
              Đã làm {answeredCount}/{questions.length} câu
            </p>
            {endsAt !== null ? (
              <p
                role="timer"
                className={clsx("flex items-center gap-1", left !== null && left <= 60 ? "font-bold text-warning" : "text-stone-500")}
              >
                <AlarmClock className="h-4 w-4" />
                {left === null ? "--:--" : timeUp ? "Hết giờ" : `Còn ${formatCountdown(left)}`}
              </p>
            ) : null}
          </div>
          <Button type="button" disabled={pending || done} onClick={() => (timeUp ? submit() : setConfirming(true))} className="shrink-0">
            <Send className="h-4 w-4" />
            {done ? "Đã nộp" : pending ? "Đang nộp..." : "Nộp bài"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mx-auto max-w-4xl px-4 pb-3 text-sm font-medium text-warning">
            {error}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <Modal title="Nộp bài?" onClose={() => setConfirming(false)}>
          <div className="grid gap-4 text-sm text-stone-600">
            {unanswered.length ? (
              <div>
                <p>
                  Em còn <b className="text-neutralText">{unanswered.length}</b> câu chưa trả lời. Bấm số câu để quay lại làm:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unanswered.map((q) => (
                    <button
                      key={q.position}
                      type="button"
                      onClick={() => goTo(q.position)}
                      className="focus-ring h-9 min-w-9 rounded-lg border border-stone-300 px-2 font-semibold tabular-nums text-neutralText hover:bg-stone-50"
                    >
                      {q.position}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p>Em đã trả lời hết {questions.length} câu.</p>
            )}
            <p>Nộp rồi thì không sửa được nữa.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Làm tiếp
              </Button>
              <Button type="button" onClick={submit}>
                <Send className="h-4 w-4" />
                Nộp bài
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
