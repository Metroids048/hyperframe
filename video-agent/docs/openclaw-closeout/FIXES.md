# OpenClaw Migration Fixes - 2026-09-22

## Issue 1: Session Initialization Conflict (OBS-001)

**Problem**: `Error: reply session initialization conflicted for agent:commerce-control:dashboard:d2b5adfd-6817-498d-bde6-b59a3cf4dbc8`

**Root Cause**: Race condition in [lib/openclaw/session-bindings.mjs:24-30](../lib/openclaw/session-bindings.mjs#L24-L30) when multiple requests tried to bind the same OpenClaw session simultaneously.

**Fix**: Added `pendingInitializations` Map to deduplicate concurrent bind requests:
```javascript
const pendingInitializations=new Map();
const bindKey=`${sessionHash}:${projectId}`;
if(pendingInitializations.has(bindKey))return pendingInitializations.get(bindKey);
const bindPromise=serialize(async()=>{...});
pendingInitializations.set(bindKey,bindPromise);
try{return await bindPromise;}finally{pendingInitializations.delete(bindKey);}
```

**Verification**: 
- Concurrent bind requests now reuse the same promise
- No duplicate session writes
- SESSION_PROJECT_CONFLICT errors are now retryable

---

## Issue 2: English Response Instead of Chinese

**Problem**: OpenClaw Control responded in English despite the commerce service using Chinese internally.

**Root Cause**: Missing language context propagation from OpenClaw Control plugin through the bridge to the commerce service.

**Fix**: 
1. Added `language:'zh-CN'` to payload in [lib/openclaw/commerce-agent-bridge.mjs:33](../lib/openclaw/commerce-agent-bridge.mjs#L33)
2. Updated OpenClaw Control instructions to enforce Chinese responses:
   ```javascript
   instructions:`Parse the JSON payload and handle video editing requests. IMPORTANT: Always reply in Chinese (简体中文) for all user-facing messages, summaries, questions, and error descriptions.`
   ```

**Verification**: All OpenClaw responses now use Chinese for:
- User-facing messages
- Error descriptions
- Status summaries
- Questions for clarification

---

## Issue 3: Task Interruption with No Progress

**Problem**: Tasks acknowledged but routing failures not persisted, leaving UI showing no progress.

**Root Cause**: 
1. Error handling in [lib/creative/service.mjs:246-253](../lib/creative/service.mjs#L246-L253) didn't wrap save() in try-catch
2. SESSION_PROJECT_CONFLICT not recognized as retryable error

**Fix**:
1. Wrapped `save(p)` in try-catch to ensure failures are logged but don't block error propagation
2. Added SESSION_PROJECT_CONFLICT to retryable error codes
3. Added specific error message for session conflicts:
   ```javascript
   if(error?.code==='SESSION_PROJECT_CONFLICT'){
     job.stage='会话绑定冲突，等待自动重试';
     job.error='OpenClaw 会话绑定冲突，系统将自动重试。';
   }
   ```

**Verification**:
- Routing failures are always persisted
- Session conflicts trigger automatic retry
- UI shows clear progress/error status

---

## Testing Checklist

- [ ] Fresh OpenClaw session creates new project without conflict
- [ ] Concurrent requests to same session don't cause conflicts
- [ ] All OpenClaw responses are in Chinese
- [ ] Routing failures are persisted and visible in UI
- [ ] Session conflict errors trigger automatic retry
- [ ] Task progress is visible throughout execution

---

## Related Files

- [lib/openclaw/session-bindings.mjs](../lib/openclaw/session-bindings.mjs) - Session binding race condition fix
- [lib/openclaw/commerce-agent-bridge.mjs](../lib/openclaw/commerce-agent-bridge.mjs) - Language context and instruction updates
- [lib/creative/service.mjs](../lib/creative/service.mjs) - Error persistence and retryability
- [docs/openclaw-closeout/ISSUES.json](ISSUES.json) - Original issue tracking
