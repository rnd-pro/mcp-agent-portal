import { Symbiote, html } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';

export class PipelineStep extends Symbiote {
  init$ = {
    name: '',
    prompt: '',
    triggerText: '',
    skillText: '',
    timeoutText: '',
    maxBouncesText: '',
  };
}

PipelineStep.template = html`
<sn-card>
  <div class="pm-step-title" slot="title">
    <span ${{ textContent: 'name' }}></span>
    <sn-badge variant="warning" ${{ textContent: 'triggerText', hidden: '!triggerText' }}></sn-badge>
  </div>
  <div class="pm-step-prompt" ${{ textContent: 'prompt' }}></div>
  <div class="pm-step-badges">
    <sn-badge variant="info" ${{ textContent: 'skillText', hidden: '!skillText' }}></sn-badge>
    <sn-badge ${{ textContent: 'timeoutText', hidden: '!timeoutText' }}></sn-badge>
    <sn-badge ${{ textContent: 'maxBouncesText', hidden: '!maxBouncesText' }}></sn-badge>
  </div>
</sn-card>
`;

PipelineStep.rootStyles = `
:host,
pm-pipeline-step {
  display: block;
}

.pm-step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-end: 8px;
}

.pm-step-prompt {
  margin-block-end: 12px;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font-mono);
  white-space: pre-wrap;
}

.pm-step-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
`;

PipelineStep.reg('pm-pipeline-step');

export default PipelineStep;
