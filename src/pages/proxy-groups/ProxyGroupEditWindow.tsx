import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { DRAG_IGNORE_SELECTOR } from '@/utils/dragUtils';

import { STEP_METADATA } from './shared/utils';
import { useProxyGroupForm } from './hooks/useProxyGroupForm';
import { TypeStep, SourceStep, ProxiesStep, BehaviorStep, AdvancedStep } from './steps';

export default function ProxyGroupEditWindow() {
  const {
    loading,
    step,
    direction,
    formData,
    setFormData,
    submitting,
    sourceMode,
    setSourceMode,
    proxyQuery,
    setProxyQuery,
    typeValue,
    needsBehavior,
    selectableTypeOptions,
    filteredProxyOptions,
    providerOptions,
    hasProviderOptions,
    visibleSteps,
    stepIndex,
    isFirstStep,
    isLastStep,
    errors,
    currentMeta,
    handleSubmit,
    handleNext,
    handleBack,
    handleGoToStep,
    handleClose,
  } = useProxyGroupForm();

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        if (step === 'advanced') handleSubmit();
        else handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, handleNext, handleSubmit]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(DRAG_IGNORE_SELECTOR)) return;
    void getCurrentWindow()
      .startDragging()
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-100">
        <div className="animate-pulse text-neutral-500">加载中...</div>
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 'type':
        return (
          <TypeStep
            formData={formData}
            setFormData={setFormData}
            selectableTypeOptions={selectableTypeOptions}
            errors={errors}
          />
        );
      case 'source':
        return (
          <SourceStep
            sourceMode={sourceMode}
            setSourceMode={setSourceMode}
            formData={formData}
            setFormData={setFormData}
          />
        );
      case 'proxies':
        return (
          <ProxiesStep
            formData={formData}
            setFormData={setFormData}
            proxyQuery={proxyQuery}
            setProxyQuery={setProxyQuery}
            filteredProxyOptions={filteredProxyOptions}
            providerOptions={providerOptions}
            hasProviderOptions={hasProviderOptions}
          />
        );
      case 'behavior':
        return needsBehavior ? (
          <BehaviorStep formData={formData} setFormData={setFormData} typeValue={typeValue} />
        ) : null;
      case 'advanced':
        return <AdvancedStep formData={formData} setFormData={setFormData} />;
      default:
        return null;
    }
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden rounded-xl border border-black/8 bg-[radial-gradient(circle_at_10%_20%,rgba(255,200,200,0.6)_0%,transparent_40%),radial-gradient(circle_at_90%_80%,rgba(180,220,255,0.8)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,#f0f0f5_0%,#e0e0eb_100%)] text-neutral-900"
      onMouseDown={handleMouseDown}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden border-none">
        <div className="absolute left-0 top-32 h-64 w-64 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />
      </div>

      <div className="relative h-full w-full grid grid-cols-[240px_1fr] border-none">
        {/* Sidebar */}
        <div className="flex flex-col bg-white/35 px-6 pt-3 pb-6 border-r border-black/5 backdrop-blur-[50px] rounded-l-xl border-l-0 border-t-0 border-b-0">
          <div className="flex flex-col gap-2">
            {visibleSteps.map((key, index) => {
              const meta = STEP_METADATA[key];
              const isActive = step === key;
              const isCompleted = stepIndex > index;
              return (
                <div
                  key={key}
                  onClick={() => handleGoToStep(key)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all cursor-pointer',
                    isActive
                      ? 'bg-white/70 text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:bg-white/40'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white border-transparent'
                        : isCompleted
                          ? 'bg-white/70 text-neutral-600 border-transparent'
                          : 'border-black/10 text-neutral-400'
                    )}
                  >
                    {index + 1}
                  </div>
                  <span>{meta.title}</span>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-blue-500 shadow-[0_0_8px_rgba(0,122,255,0.7)]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="relative flex flex-col overflow-hidden bg-white/25 backdrop-blur-[50px] rounded-r-xl">
          <div className="flex-none px-8 pt-10 pb-6">
            <h1 className="text-2xl font-semibold text-neutral-900">{currentMeta.title}</h1>
            <p className="mt-1 text-sm text-neutral-500">{currentMeta.description}</p>
          </div>

          <div className="flex-1 min-h-0 relative">
            <div
              className={cn(
                'absolute inset-0 px-8 pb-24',
                step === 'proxies'
                  ? 'overflow-hidden flex flex-col'
                  : 'overflow-y-auto custom-scrollbar'
              )}
            >
              <div
                className={cn(
                  'h-full transition-all duration-500 ease-out',
                  direction === 'forward'
                    ? 'animate-in fade-in slide-in-from-right-8'
                    : 'animate-in fade-in slide-in-from-left-8',
                  step === 'proxies' && 'flex flex-col'
                )}
              >
                {renderStep()}
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleClose}
              className="h-10 px-5 rounded-full bg-white/40 text-neutral-700 border border-white/60 hover:bg-white/70"
            >
              取消
            </Button>

            <div className="flex items-center gap-3">
              {!isFirstStep && (
                <Button
                  variant="secondary"
                  onClick={handleBack}
                  className="h-10 px-6 rounded-full bg-white/40 text-neutral-800 border border-white/60 hover:bg-white/70"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一步
                </Button>
              )}
              <Button
                onClick={isLastStep ? handleSubmit : handleNext}
                className={cn(
                  'h-10 px-7 rounded-full font-semibold shadow-[0_6px_16px_rgba(0,122,255,0.25)]',
                  'bg-blue-600 hover:bg-blue-500 text-white'
                )}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    保存中...
                  </>
                ) : isLastStep ? (
                  <>
                    完成设置
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    下一步
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
