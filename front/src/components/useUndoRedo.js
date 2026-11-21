// useUndoRedo.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import cloneDeep from 'lodash/cloneDeep';

const isEqualSerialized = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return a === b;
  }
};

export const useUndoRedo = (initialState, maxHistory = 20) => {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [meta, setMeta] = useState({ undoCount: 0, redoCount: 0 });

  const pushUndoSnapshot = useCallback((snapshotRaw, description) => {
    const snapshot = cloneDeep(snapshotRaw);
    const arr = undoRef.current;
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      if (isEqualSerialized(last.state, snapshot)) return;
    }
    arr.push({ state: snapshot, description: description ?? 'تغییر' });
    if (arr.length > maxHistory) arr.shift();
    setMeta({ undoCount: arr.length, redoCount: redoRef.current.length });
  }, [maxHistory]);

  const updateState = useCallback((nextOrUpdater, description = 'تغییر نامشخص', options = { toast: false, record: true }) => {
    const prev = stateRef.current;
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;

    if (isEqualSerialized(prev, next)) return;

    if (options && options.record === false) {
      redoRef.current = [];
      setMeta({ undoCount: undoRef.current.length, redoCount: 0 });
    } else {
      pushUndoSnapshot(prev, description);
      redoRef.current = [];
      setMeta({ undoCount: undoRef.current.length, redoCount: 0 });
    }

    const nextCloned = cloneDeep(next);
    setState(nextCloned);
    stateRef.current = nextCloned;

    if (options && options.toast) toast.info(`تغییر ذخیره شد: ${description}`);
  }, [pushUndoSnapshot]);

  const undo = useCallback(() => {
    const u = undoRef.current;
    if (u.length === 0) {
      toast.warn('هیچ تغییری برای بازگشت وجود ندارد');
      return;
    }
    const last = u.pop();
    redoRef.current.unshift({ state: cloneDeep(stateRef.current), description: last.description });
    const applied = cloneDeep(last.state);
    setState(applied);
    stateRef.current = applied;
    setMeta({ undoCount: u.length, redoCount: redoRef.current.length });
    toast.success(`بازگشت انجام شد: ${last.description}`);
  }, []);

  const redo = useCallback(() => {
    const r = redoRef.current;
    if (r.length === 0) {
      toast.warn('هیچ تغییری برای بازگردانی وجود ندارد');
      return;
    }
    const next = r.shift();
    undoRef.current.push({ state: cloneDeep(stateRef.current), description: next.description });
    const applied = cloneDeep(next.state);
    setState(applied);
    stateRef.current = applied;
    setMeta({ undoCount: undoRef.current.length, redoCount: r.length });
    toast.success(`بازگردانی انجام شد: ${next.description}`);
  }, []);

  const history = undoRef.current.map((it) => it.description);

  return {
    state,
    updateState,
    undo,
    redo,
    canUndo: meta.undoCount > 0,
    canRedo: meta.redoCount > 0,
    history,
    stateRef,
    _internal: { undoRef, redoRef, stateRef }
  };
};