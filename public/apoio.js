const supportStatus = document.getElementById('support-status') || document.getElementById('pix-status');
const pixCode = '00020101021126580014br.gov.bcb.pix0136bfd3db4d-75f3-4f61-a50a-311c33fdbfef5204000053039865802BR5923MAURICIO S DA S PEREIRA6008BRASILIA62070503***6304BB09';
// The QR encodes the complete BR Code above, including its checksum.
const pixQrSource = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAT4AAAE+AQAAAAA8Q0GdAAADZUlEQVR4nO1abWrjMBAdWYL+lGEPkKMoNys9Um8gH6UHKMg/AzJveTNy2oUltJCyyWxECLYigp7m682MAuRLY5u+tk7ksfDimC7//DEeCy+O6fLP//tCAcyyS0SNTSSji0iuQJUMzohEoLtDHQG0IhkAuuLlZOM5oBVb4Av1xK81JJEukmRJfC/bvHSRbeZLCMdb2ONVF6ZPT6GHEt/m+D6jLduhbb8kvX/7H6e7WohWnvByOmCbJa3PIkt8O97YHq8q6wxZ6cG2uaW+xD40IHXOwxZ59eHtrx/x6sNtiBTJteca6cCJFOrMbfhDHRsdOFB7ZpAy4QKEj1bsHPyhBmDBmuSkFZtUrsIT8CrrnmsXyrRTyU30pWceguqAP5YiJuhI9TbUNVKrVfpN1bvpyThEXc1d065b6bRrzqAJdNIl6kjHRVmjCb23cm9LQPQoqmtZF7NiMO8Y1h31wSXqzjDNb8uzzLrNh4+MzCPqqBml2bLl15Ryo6CVn/uUdSQuNWHDy0OgdcezkntEDVo0tXpwcip2VXaqVM2hD58s74p4ARONRcP0ss3S16PI0tcQ23IDe/yJnKuQe6vEadocWjhqNu/TrrvmF0bGzIr3CA7XkQsWs/7IsrHHMnv2ycOhbwOjRe34IXeHqCOlTNet8bqey2jYCynuNHxi527WGpG+72mXbDP9uWScZp91MyghGY0Pza/Ne3d9dcvNMPo7mloyZln+JTRzt5ErqqO2VPqjjCDK1iz3dBuva6cf08x6Z+PRgppDbyajLKZ9rjMxM38eafLq2/3KOipLGfUiPQTZK2kuZQ3Fuwfo4c3Uh+tRZLcaLppXnisMqu1ijNTaAf5QY29/jDREa6QWx7FTU4fcLATJNUl5IiUjdjbrZ+vac7LfEZhvVYbbXiNV7k1SCqq9vqile9RwWJjW0ugolMlQeNN2X6gnvXkS7PJJbJporEdZj4kFlsLnm9jjj/hwDH5CHq71E0Lun3rZLivDkcGadTNzZecGn1je7Re1WAubdMV6W9V6mnZjwRfq6fzEG0frETTtIuszP2rpW3i+mT1e/w7SKfF2GesqdOPLdngN+XVL0vNL6vcBZvrOwi2EMEtiscjuFlLcT3t1xa4d/us9XndheNyKv3cRTo+Fl8Z08VevC38DxDB9O7Y9lYUAAAAASUVORK5CYII=';

function bindCopy(buttonId, fieldId, copiedMessage, selectedMessage) {
  const button = document.getElementById(buttonId);
  const field = document.getElementById(fieldId);
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      supportStatus.textContent = copiedMessage;
    } catch {
      field.hidden = false;
      field.focus();
      field.select();
      supportStatus.textContent = selectedMessage;
    }
  });
}

bindCopy('copy-pix', 'pix-key', 'Chave Pix copiada.', 'Chave selecionada. Copie-a para colar no app do banco.');
const pixQr = document.getElementById('pix-qr');
pixQr.src = pixQrSource;
pixQr.hidden = false;
document.getElementById('pix-code').value = pixCode;
bindCopy('copy-pix-code', 'pix-code', 'Código Pix copiado.', 'Código selecionado. Copie-o para colar no app do banco.');

const supportMethods = document.getElementById('support-methods');
if (supportMethods) {
  const tabs = [...supportMethods.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const cryptoDetails = document.getElementById('support-crypto');
  const network = document.getElementById('support-network');

  const setTabStop = index => {
    tabs.forEach((tab, position) => { tab.tabIndex = position === index ? 0 : -1; });
  };
  const showMethod = (index = -1) => {
    const selectedTab = tabs[index];
    if (selectedTab?.dataset.network) {
      network.textContent = selectedTab.dataset.network;
      panels[index].append(cryptoDetails);
    }
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      panels[position].hidden = !selected;
    });
    setTabStop(Math.max(0, index));
    supportStatus.textContent = '';
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showMethod(index));
  });
  supportMethods.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
      case 'ArrowRight': next = (index + 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTabStop(next);
    tabs[next].focus();
  });
  document.getElementById('support-dialog').addEventListener('close', () => showMethod());
  bindCopy('copy-support-address', 'support-address', 'Endereço copiado.', 'Endereço selecionado. Copie-o para colar na sua carteira.');
}
