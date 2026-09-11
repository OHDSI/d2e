import React, { FC, ReactNode, useEffect } from "react";
import { useToken, useTranslation } from "../../../contexts";
import { useFeatures } from "../../../hooks";
import "./PluginContainer.scss";
import { resolveIdTokenName } from "../../../utils/idTokenName";

interface PluginContainerProps {
  getToken?: () => Promise<string>;
  qeSvcUrl?: string;
  studyId?: string;
  releaseId?: string;
  children?: ReactNode;
}

const PluginContainer: FC<PluginContainerProps> = ({
  children,
  getToken,
  qeSvcUrl,
  studyId,
  releaseId,
}) => {
  const { idTokenClaims } = useToken();
  const { locale } = useTranslation();
  const [features, featuresLoading] = useFeatures();

  return (
    <div
      className="plugin-container"
      ref={(node: any) => {
        if (node) {
          node.portalAPI = {
            getToken,
            qeSvcUrl,
            studyId,
            releaseId,
            username: resolveIdTokenName(idTokenClaims),
            features,
            featuresLoading,
            locale,
          };
        }
      }}
    >
      {children}
    </div>
  );
};

export default PluginContainer;
