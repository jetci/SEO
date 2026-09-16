import * as React from "react";

export interface TwemojiImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  emoji?: string;
  size?: number | string;
}

export const TwemojiImg: React.FC<TwemojiImgProps> = ({ emoji, size, className, alt, ...rest }) => {
  const style: React.CSSProperties = {
    width: size ?? "1em",
    height: size ?? "1em",
    display: "inline-block",
    verticalAlign: "-0.125em",
  };
  if (emoji) {
    return (
      <span role="img" aria-label={alt ?? emoji} style={style} className={className}>
        {emoji}
      </span>
    );
  }
  return <img alt={alt ?? ""} className={className} style={style} {...rest} />;
};

export default TwemojiImg;
