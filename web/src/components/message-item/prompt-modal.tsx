import { IModalProps } from '@/interfaces/common';
import { IFeedbackRequestBody } from '@/interfaces/request/chat';
import { Modal, Space } from 'antd';
import HightLightMarkdown from '../highlight-markdown';
import SvgIcon from '../svg-icon';

const PromptModal = ({
  visible,
  hideModal,
  prompt,
  className,
}: IModalProps<IFeedbackRequestBody> & { prompt?: string, className?: string }) => {
  return (
    <Modal
      title={
        <Space>
          <SvgIcon name={`prompt`} width={18}></SvgIcon>
          Prompt
        </Space>
      }
      width={'80%'}
      open={visible}
      onCancel={hideModal}
      footer={null}
      className={`theme-aware-modal ${className || ''}`}
    >
      <HightLightMarkdown>{prompt}</HightLightMarkdown>
    </Modal>
  );
};

export default PromptModal;