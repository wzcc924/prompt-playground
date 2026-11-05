<script setup lang="ts">
import { useSettings } from '@/stores/settings'

const settings = useSettings()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <span>接口设置</span>
        <button class="icon-btn" style="opacity: 1" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="switch-row">
          <div>
            <div style="font-weight: 600; font-size: 13px">Mock 引擎</div>
            <div class="hint">不填 Key 也能完整演示：模拟首字延迟与逐字输出</div>
          </div>
          <button
            class="switch"
            :class="{ 'is-on': settings.useMock }"
            @click="settings.useMock = !settings.useMock"
          />
        </div>

        <div class="field">
          <label>接口地址</label>
          <input v-model="settings.baseUrl" placeholder="https://api.deepseek.com/v1" spellcheck="false" />
          <small>需兼容 OpenAI 的 /chat/completions 协议，末尾不带斜杠也可以</small>
        </div>

        <div class="field">
          <label>API Key</label>
          <input v-model="settings.apiKey" type="password" placeholder="sk-..." spellcheck="false" />
          <small>只存在浏览器 localStorage，不会发往除你填写的接口之外的任何地址</small>
        </div>

        <div class="field">
          <label>System Prompt（可选）</label>
          <textarea v-model="settings.system" rows="3" placeholder="对三个模型同时生效的系统指令" />
        </div>

        <div class="hint">
          提示：真实接口和 Mock 的指标都会记录，方便对比不同模型的首字延迟与成本。
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-primary" @click="$emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>
