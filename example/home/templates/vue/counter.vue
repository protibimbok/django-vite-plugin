<script setup>
import { ref } from 'vue';

const count = ref(0);
</script>
<template>
    <button
        @click="count++"
        class="px-3 py-2 rounded border border-gray-500 bg-white">
        Count: {{ count }}
    </button>
</template>